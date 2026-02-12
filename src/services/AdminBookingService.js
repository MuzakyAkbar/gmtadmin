import axios from "axios";
import { supabase } from "../plugins/supabaseClient";

export default class AdminBookingService {
  
  async getAllUsers() {
    return supabase
      .from("bo_user")
      .select("id, name, email, phone, companyname")
      .eq("isactive", true)
      .order("name", { ascending: true });
  }

  async getAllVenues() {
    return supabase
      .from("bo_venue")
      .select("id, name, address, description")
      .eq("isactive", true)
      .order("name", { ascending: true });
  }

  async createAdminBooking(bookingData) {
    try {
      const { data: booking, error: bookingError } = await supabase
        .from("bo_booking")
        .insert({
          bo_venue_id: bookingData.bo_venue_id,
          bo_user_id: bookingData.bo_user_id,
          bookingdate: bookingData.bookingdate,
          grandtotal: bookingData.grandtotal,
          original_total: bookingData.original_total,
          discount_amount: bookingData.discount_amount || 0,
          bo_referral_id: bookingData.bo_referral_id || null,
          status: 'CO',
          created: new Date().toISOString(),
          isactive: true
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      if (bookingData.lines && bookingData.lines.length > 0) {
        const lines = bookingData.lines.map(line => ({
          bo_booking_id: booking.id,
          bo_venue_id: bookingData.bo_venue_id,
          bo_slot_id: line.bo_slot_id,
          tanggal: line.tanggal,
          price: line.price,
          isactive: true
        }));

        const { error: linesError } = await supabase
          .from("bo_bookingline")
          .insert(lines);

        if (linesError) throw linesError;
      }

      if (bookingData.joggingLines && bookingData.joggingLines.length > 0) {
        const joggingLines = bookingData.joggingLines.map(line => ({
          bo_booking_id: booking.id,
          bo_venue_id: bookingData.bo_venue_id,
          bo_slot_id: line.bo_slot_id,
          tanggal: line.tanggal,
          jumlah_orang: line.jumlah_orang,
          harga_per_orang: line.harga_per_orang,
          price: line.price,
          isactive: true
        }));

        const { error: joggingError } = await supabase
          .from("bo_bookingline_jogging")
          .insert(joggingLines);

        if (joggingError) throw joggingError;
      }

      const { error: paymentError } = await supabase
        .from("bo_payment")
        .insert({
          bo_booking_id: booking.id,
          bo_user_id: bookingData.bo_user_id,
          total: bookingData.grandtotal,
          totalbayar: bookingData.grandtotal,
          payment_method: 'admin_manual',
          payment_channel: 'admin_panel',
          status: 'CO',
          currency: 'IDR',
          created: new Date().toISOString(),
          isactive: true
        });

      if (paymentError) throw paymentError;

      return { data: booking, error: null };

    } catch (error) {
      console.error('Error creating admin booking:', error);
      return { data: null, error };
    }
  }

  async getSlotCapacity(slot_id, tanggal) {
    const tanggalStr = tanggal instanceof Date ? tanggal.toISOString().split('T')[0] : tanggal;
    
    const { data, error } = await supabase
      .from('bo_bookingline_jogging')
      .select('jumlah_orang, bo_booking!inner(status)')
      .eq('bo_slot_id', slot_id)
      .eq('tanggal', tanggalStr)
      .in('bo_booking.status', ['WP', 'CO'])
      .eq('isactive', true);
    
    if (error) {
      console.error('Error getting slot capacity:', error);
      return { data: 0, error };
    }
    
    const totalBooked = data.reduce((sum, item) => sum + (item.jumlah_orang || 0), 0);
    
    return { data: totalBooked, error: null };
  }

  async getSlotPrice(venueId, slotId, tanggal) {
    try {
      const { data: prices, error } = await supabase
        .from("bo_price")
        .select("*")
        .eq("bo_venue_id", venueId)
        .eq("bo_slot_id", slotId)
        .eq("isactive", true);

      if (error) throw error;

      if (!prices || prices.length === 0) {
        return { price: 0, pricePerPerson: 0, capacity: 0, error: null };
      }

      const tanggalDate = tanggal instanceof Date ? tanggal : new Date(tanggal);
      const dayOfWeek = tanggalDate.getDay();

      let applicablePrice = prices[0];

      for (const price of prices) {
        const startDate = price.start_date ? new Date(price.start_date) : null;
        const endDate = price.end_date ? new Date(price.end_date) : null;

        if (startDate && tanggalDate < startDate) continue;
        if (endDate && tanggalDate > endDate) continue;

        if (price.is_primetime && price.primetime_days) {
          const primetimeDays = Array.isArray(price.primetime_days) 
            ? price.primetime_days 
            : JSON.parse(price.primetime_days);

          if (primetimeDays.includes(dayOfWeek)) {
            applicablePrice = price;
            break;
          }
        } else if (!price.is_primetime) {
          applicablePrice = price;
        }
      }

      return {
        price: applicablePrice.amount || 0,
        pricePerPerson: applicablePrice.price_per_person || 0,
        capacity: applicablePrice.kapasitas || 0,
        isPrimetime: applicablePrice.is_primetime || false,
        error: null
      };

    } catch (error) {
      console.error('Error getting slot price:', error);
      return { price: 0, pricePerPerson: 0, capacity: 0, error };
    }
  }
}