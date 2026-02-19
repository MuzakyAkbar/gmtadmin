import axios from "axios";
import { supabase } from "../plugins/supabaseClient";

export default class BookingService {
  getBooking(id) {
    return supabase
      .from("bo_booking")
      .select(
        `
        id,
        bo_venue (name),
        status,
        grandtotal,
        bookingdate,
        created,
        skey,
        bo_user (name,email,phone,companyname),
        bo_bookingline (
        tanggal,
        bo_slot(name,start_time,end_time),
        price),
        bo_bookingline_jogging (
        tanggal,
        bo_slot(name,start_time,end_time),
        jumlah_orang,
        harga_per_orang,
        price),
        bo_payment (created,status),
        payment_url,
        bo_referral_id,
        discount_amount,
        original_total
      `
      )
      .eq("id", id)
      .order("created", { ascending: true });
  }
  getSlots(venue_id) {
    return supabase
      .from("bo_price")
      .select(
        `
        id,
        bo_slot (id,start_time,end_time),
        amount,
        price_per_person,
        kapasitas,
        is_primetime,
        primetime_days,
        start_date,
        end_date,
        bo_slot_id
      `
      )
      .eq("bo_venue_id", venue_id)
      .eq("isactive", true)
      .order("amount", { ascending: true });
  }
  listBooking(user_id) {
    return supabase
      .from("bo_booking")
      .select(
        `
        id,
        skey,
        bo_venue (name),
        status,
        grandtotal,
        bookingdate,
        created,
        bo_user (name,email),
        bo_bookingline (
        tanggal,
        bo_slot(name,start_time,end_time),
        price),
        bo_bookingline_jogging (
        tanggal,
        bo_slot(name,start_time,end_time),
        jumlah_orang,
        harga_per_orang,
        price),
        bo_payment (created,status),
        bo_referral_id,
        discount_amount,
        original_total
      `
      )
      .eq("bo_user_id", user_id)
      .range(0, 9)
      .order("created", { ascending: false });
  }
  async listSchedules(venue_id) {
    // Get from RPC (bo_bookingline only)
    const rpcResult = await supabase.rpc("getBookingSchedules", { venue_id: venue_id });
    
    // Get jogging bookings separately
    const joggingResult = await supabase
      .from("bo_bookingline_jogging")
      .select(`
        tanggal,
        bo_slot_id,
        bo_booking!inner(status, id)
      `)
      .eq("bo_venue_id", venue_id)
      .eq("isactive", true);
    
    // Combine results
    let combinedData = [];
    
    if (rpcResult.data) {
      combinedData = [...rpcResult.data];
    }
    
    if (joggingResult.data) {
      // Transform jogging data to match RPC format
      const joggingTransformed = joggingResult.data.map(item => ({
        tanggal: item.tanggal,
        bo_slot_id: item.bo_slot_id,
        status: item.bo_booking.status,
        bookingdate: item.tanggal
      }));
      combinedData = [...combinedData, ...joggingTransformed];
    }
    
    return { data: combinedData, error: rpcResult.error };
  }
  
  // Get capacity info for per-person slots
  async getSlotCapacity(slot_id, tanggal) {
    // Query langsung untuk sum jumlah_orang dari bo_bookingline_jogging
    // Gunakan local date string agar tidak shift timezone
    const tanggalStr = tanggal instanceof Date
        ? `${tanggal.getFullYear()}-${String(tanggal.getMonth()+1).padStart(2,'0')}-${String(tanggal.getDate()).padStart(2,'0')}`
        : tanggal;
    
    const { data, error } = await supabase
      .from('bo_bookingline_jogging')
      .select('jumlah_orang, bo_booking!inner(status)')
      .eq('bo_slot_id', slot_id)
      .eq('tanggal', tanggalStr)
      .in('bo_booking.status', ['WP', 'CO']) // Hanya yang WP atau CO
      .eq('isactive', true);
    
    if (error) {
      console.error('Error getting slot capacity:', error);
      return { data: 0, error };
    }
    
    // Sum semua jumlah_orang
    const totalBooked = data.reduce((sum, item) => sum + (item.jumlah_orang || 0), 0);
    
    return { data: totalBooked, error: null };
  }
  createPaymentLink(order) {
    return axios.post(
      "https://s01.pirantisolusi.com/apisck2/createpaymentlink",
      // "http://localhost:3080/createpaymentlink",
      {
        id: order,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  }
}