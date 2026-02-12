<script setup>
import { onMounted, ref, watch, computed } from 'vue';
import { DatePicker, useToast, Dialog } from 'primevue';
import { useConfirm } from 'primevue';
import {useI18n} from 'vue-i18n';
import {formatCurrency} from '../../composables/formater'
import RestService from '../../services/rest';
import AdminBookingService from '../../services/AdminBookingService';

const props = defineProps(['entity','objectname','child1name','title','columns','searchfield','details','sortby','candelete','canedit'])
const i18n = useI18n()
const toast = useToast();
const confirm = useConfirm()

const svc = new RestService(props.objectname);
const svcline = new RestService(props.child1name);
const svcslot = new RestService('bo_slot');
const svcpayment = new RestService('bo_payment');
const svcvenue = new RestService('bo_venue');
const adminBookingService = new AdminBookingService();

const listview = ref(true)
const showVenueList = ref(true)
const isloading = ref(true)
const isupdating = ref(false)
const data = ref()
const dt = ref()
const tabledata = ref()
const form = ref({})
const references = ref([])
const refvalue = ref([])
const dataline = ref([])
const dataslot = ref({})
const svcprice = new RestService('bo_price');
const availableSlots = ref([])
const lineForm = ref({})
const showLineDialog = ref(false)
const isLineLoading = ref(false)
const tempDataline = ref([])
const tempJoggingLines = ref([])
const isAllDaySelected = ref(false)
const originalAllDayPrice = ref(0)
const existingBookings = ref([])

// Venue filter
const venues = ref([])
const selectedVenue = ref(null)
const filteredData = computed(() => {
    if (!selectedVenue.value) return data.value
    return data.value?.filter(d => d.bo_venue_id === selectedVenue.value.id) || []
})

// Computed untuk total harga
const calculatedGrandTotal = computed(() => {
    let total = 0;
    
    // Sum dari tempDataline
    if (tempDataline.value && tempDataline.value.length > 0) {
        total += tempDataline.value.reduce((sum, line) => sum + (line.price || 0), 0);
    }
    
    // Sum dari tempJoggingLines
    if (tempJoggingLines.value && tempJoggingLines.value.length > 0) {
        total += tempJoggingLines.value.reduce((sum, line) => sum + (line.price || 0), 0);
    }
    
    return total;
});

// Auto update grandtotal ketika lines berubah
watch([tempDataline, tempJoggingLines], () => {
    form.value.grandtotal = calculatedGrandTotal.value;
}, { deep: true });

const loadExistingBookingsForDate = async (venueId, date) => {
    if (!venueId || !date) {
        existingBookings.value = []
        return
    }
    try {
        const dateStr = new Date(date).toISOString().slice(0, 10)
        const whereclause = [
            { field: 'bo_venue_id', op: 'eq', value: venueId },
            { field: 'tanggal', op: 'eq', value: dateStr },
            { field: 'isactive', op: 'eq', value: true }
        ]
        const result = await svcline.listwhere(0, 250, whereclause)
        if (result.data && result.data.length > 0) {
            const bookingIds = [...new Set(result.data.map(l => l.bo_booking_id))]
            const bookings = await Promise.all(bookingIds.map(id => svc.getById(id)))
            existingBookings.value = result.data.map(line => {
                const booking = bookings.find(b => b.data && b.data.id === line.bo_booking_id)
                return { ...line, status: booking?.data?.status || 'UNKNOWN' }
            })
        } else {
            existingBookings.value = []
        }
    } catch (err) {
        console.error('Error loading existing bookings:', err)
        existingBookings.value = []
    }
}

const loadVenues = async () => {
    const result = await svcvenue.list(0, 100, { col: 'seqno', asc: { ascending: true } })
    if (result.data) {
        venues.value = result.data.filter(v => v.isactive)
    }
}

const onAdd = async ()=>{
    if (!selectedVenue.value) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select venue first', life: 3000})
        return
    }
    
    isloading.value = true

    form.value = {
        status:'CO',
        created: new Date().toISOString(),
        bookingdate: new Date().toISOString(),
        grandtotal: 0,
        original_total: 0,
        discount_amount: 0,
        bo_venue_id: selectedVenue.value.id
    }
    
    isupdating.value = false
    listview.value = false
    dataline.value = []
    dataslot.value = {}
    tempDataline.value = [] 
    tempJoggingLines.value = []
    existingBookings.value = []
    
    isloading.value = false
}

const createPayment = async (bookingId, userId, totalAmount) => {
    try {
        // Cek dulu apakah sudah ada payment untuk booking ini
        const checkWhere = [
            {
                field: 'bo_booking_id',
                op: 'eq',
                value: bookingId
            }
        ]
        
        const existingPayment = await svcpayment.listwhere(0, 1, checkWhere)
        
        // Jika sudah ada payment, skip
        if(existingPayment.data && existingPayment.data.length > 0) {
            console.log('Payment already exists for this booking')
            return existingPayment.data[0]
        }
        
        // Buat payment baru
        const paymentData = {
            bo_booking_id: bookingId,
            bo_user_id: userId,
            total: totalAmount,
            totalbayar: totalAmount,
            payment_method: 'admin_manual',
            payment_channel: 'admin_panel',
            status: 'CO',
            currency: 'IDR',
            created: new Date().toISOString(),
            isactive: true
        }
        
        const result = await svcpayment.add(paymentData)
        
        if(result.error) {
            throw new Error(result.error.message)
        }
        
        return result.data[0]
        
    } catch(err) {
        console.error('Error creating payment:', err)
        throw err
    }
}

const onSave = async ()=>{
    // Validasi
    if(!form.value.bo_venue_id) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select venue', life: 3000})
        return
    }
    
    if(!form.value.bo_user_id) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select user', life: 3000})
        return
    }
    
    if(tempDataline.value.length === 0 && tempJoggingLines.value.length === 0 && !isupdating.value) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please add at least one booking line', life: 3000})
        return
    }
    
    isloading.value = true
    
    try {
        if(isupdating.value){
            // Update booking header
            const updateResult = await svc.update(form.value.id, {
                bo_venue_id: form.value.bo_venue_id,
                bo_user_id: form.value.bo_user_id,
                bookingdate: form.value.bookingdate,
                grandtotal: form.value.grandtotal,
                original_total: form.value.original_total,
                discount_amount: form.value.discount_amount,
                status: form.value.status
            })
            
            if(updateResult.error){
                toast.add({severity:'error',summary:'Error',detail:updateResult.error.message, life: 3000})
                isloading.value = false
                return
            }
            
            // Jika ada new regular lines di temp, save ke DB
            if(tempDataline.value.length > 0) {
                let lineData = tempDataline.value.map(line => ({
                    bo_booking_id: form.value.id,
                    bo_venue_id: form.value.bo_venue_id,
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    price: line.price,
                    isactive: true
                }))
                
                for (const line of lineData) {
                    const addResult = await svcline.add(line)
                    if(addResult.error){
                        toast.add({severity:'error',summary:'Error',detail:addResult.error.message, life: 3000})
                    }
                }
                
                tempDataline.value = []
            }
            
            // Jika ada new jogging lines di temp, save ke DB
            if(tempJoggingLines.value.length > 0) {
                const svcJogging = new RestService('bo_bookingline_jogging')
                
                let joggingData = tempJoggingLines.value.map(line => ({
                    bo_booking_id: form.value.id,
                    bo_venue_id: form.value.bo_venue_id,
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    jumlah_orang: line.jumlah_orang,
                    harga_per_orang: line.harga_per_orang,
                    price: line.price,
                    isactive: true
                }))
                
                for (const line of joggingData) {
                    const addResult = await svcJogging.add(line)
                    if(addResult.error){
                        toast.add({severity:'error',summary:'Error',detail:addResult.error.message, life: 3000})
                    }
                }
                
                tempJoggingLines.value = []
            }
            
            toast.add({severity:'success',summary:'Success',detail:'Booking updated successfully', life: 3000})
            
        }else{
            // Create booking header
            const saveResult = await svc.add({
                bo_venue_id: form.value.bo_venue_id,
                bo_user_id: form.value.bo_user_id,
                bookingdate: form.value.bookingdate,
                created: form.value.created,
                grandtotal: form.value.grandtotal,
                original_total: form.value.original_total,
                discount_amount: form.value.discount_amount,
                status: form.value.status,
                isactive: true
            })
            
            if(saveResult.error){
                toast.add({severity:'error',summary:'Error',detail:saveResult.error.message, life: 3000})
                isloading.value = false
                return
            }
            
            const newBookingId = saveResult.data[0].id
            
            // Create payment
            try {
                await createPayment(newBookingId, form.value.bo_user_id, form.value.grandtotal)
            } catch(err) {
                console.error('Payment creation failed:', err)
                toast.add({severity:'warn',summary:'Warning',detail:'Booking created but payment creation failed', life: 3000})
            }
            
            // Save regular lines
            if(tempDataline.value.length > 0) {
                let lineData = tempDataline.value.map(line => ({
                    bo_booking_id: newBookingId,
                    bo_venue_id: form.value.bo_venue_id,
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    price: line.price,
                    isactive: true
                }))
                
                for (const line of lineData) {
                    const addResult = await svcline.add(line)
                    if(addResult.error){
                        toast.add({severity:'error',summary:'Error',detail:addResult.error.message, life: 3000})
                    }
                }
            }
            
            // Save jogging lines
            if(tempJoggingLines.value.length > 0) {
                const svcJogging = new RestService('bo_bookingline_jogging')
                
                let joggingData = tempJoggingLines.value.map(line => ({
                    bo_booking_id: newBookingId,
                    bo_venue_id: form.value.bo_venue_id,
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    jumlah_orang: line.jumlah_orang,
                    harga_per_orang: line.harga_per_orang,
                    price: line.price,
                    isactive: true
                }))
                
                for (const line of joggingData) {
                    const addResult = await svcJogging.add(line)
                    if(addResult.error){
                        toast.add({severity:'error',summary:'Error',detail:addResult.error.message, life: 3000})
                    }
                }
            }
            
            toast.add({severity:'success',summary:'Success',detail:'Booking created successfully', life: 3000})
        }
        
        await onRefresh()
        listview.value = true
        isupdating.value = false
        form.value = {}
        tempDataline.value = []
        tempJoggingLines.value = []
        existingBookings.value = []
        
    } catch(err) {
        console.error('Error saving booking:', err)
        toast.add({severity:'error',summary:'Error',detail:'Failed to save booking'})
    } finally {
        isloading.value = false
    }
}

const onDelete = (item)=>{
    confirm.require({
        message: i18n.t('Delete this item?'),
        header: i18n.t('Delete Confirmation'),
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: 'Delete',
            severity: 'danger'
        },
        accept: ()=>{
            isloading.value = true
            svc.delete(item.id).then(async r=>{
                if(r.error){
                    toast.add({severity:'error',summary:'Error',detail:r.error.message, life: 3000})
                    isloading.value = false
                }else{
                    toast.add({severity:'success',summary:'Success',detail:r.statusText, life: 3000})
                    await onRefresh()
                    isloading.value = false
                }
            })
        }
    })
}

const onEdit = item => {
    form.value = {...item}
    isupdating.value = true
    listview.value = false
    tempDataline.value = []
    tempJoggingLines.value = []

    fetchBookingLines(item.id)
}

const fetchBookingLines = async (bookingId) => {
    if(props.child1name == 'bo_bookingline' && bookingId){
        isloading.value = true
        const whereclause = [
            {
                field: 'bo_booking_id',
                op: 'eq',
                value: bookingId
            },
            {
                field: 'isactive',
                op: 'eq',
                value: true
            }
        ]
        
        try {
            const result = await svcline.listwhere(0, 250, whereclause)
            dataline.value = result.data || []
            
            // Fetch jogging lines juga
            const svcJogging = new RestService('bo_bookingline_jogging');
            const joggingResult = await svcJogging.listwhere(0, 250, whereclause)
            const joggingLines = joggingResult.data || []
            
            // Gabungkan dataline dengan jogging lines untuk ditampilkan
            const allLines = [...dataline.value, ...joggingLines]
            
            // Fetch slots untuk setiap booking line
            if(allLines.length > 0){
                await fetchSlots(allLines)
            }
            
            isloading.value = false
        } catch(err) {
            isloading.value = false
            toast.add({severity:'error', summary:'Error', detail:err})
        }
    }
}

const fetchSlots = async (bookingLines) => {
    const slotIds = [...new Set(bookingLines.map(line => line.bo_slot_id).filter(id => id))]
    
    if(slotIds.length === 0) return
    
    const whereclause = [
        {
            field: 'id',
            op: 'in',
            value: slotIds
        }
    ]
    
    const result = await svcslot.listwhere(0, 250, whereclause)
    if(result.data){
        result.data.forEach(slot => {
            dataslot.value[slot.id] = slot
        })
    }
}

const fetchAvailableSlots = async (venueId, selectedDate = null) => {
    if(!venueId) return []
    
    isLineLoading.value = true
    
    try {
        if (selectedDate) {
            await loadExistingBookingsForDate(venueId, selectedDate)
        }
        
        // Fetch prices untuk venue ini
        const priceWhere = [
            {
                field: 'bo_venue_id',
                op: 'eq',
                value: venueId
            },
            {
                field: 'isactive',
                op: 'eq',
                value: true
            }
        ]
        
        const priceResult = await svcprice.listwhere(0, 250, priceWhere)
        
        if(priceResult.data && priceResult.data.length > 0){
            // Get unique slot IDs
            const slotIds = [...new Set(priceResult.data.map(p => p.bo_slot_id).filter(id => id))]
            
            // Fetch slot details
            const slotWhere = [
                {
                    field: 'id',
                    op: 'in',
                    value: slotIds
                },
                {
                    field: 'isactive',
                    op: 'eq',
                    value: true
                }
            ]
            
            const slotResult = await svcslot.listwhere(0, 250, slotWhere, {col: 'seqno', ascending: true})
            
            if(slotResult.data) {
                // Combine slot with price info
                const slotsWithPrice = await Promise.all(slotResult.data.map(async slot => {
                    // Get applicable price for this slot
                    let price = 0;
                    let pricePerPerson = 0;
                    let capacity = 0;
                    let isPerPerson = false;
                    
                    if (selectedDate) {
                        const priceInfo = await adminBookingService.getSlotPrice(venueId, slot.id, selectedDate);
                        price = priceInfo.price;
                        pricePerPerson = priceInfo.pricePerPerson;
                        capacity = priceInfo.capacity;
                        isPerPerson = pricePerPerson > 0;
                    } else {
                        // Jika belum pilih tanggal, ambil harga default
                        const priceData = priceResult.data.find(p => p.bo_slot_id === slot.id && !p.is_primetime);
                        price = priceData?.amount || 0;
                        pricePerPerson = priceData?.price_per_person || 0;
                        capacity = priceData?.kapasitas || 0;
                        isPerPerson = pricePerPerson > 0;
                    }
                    
                    let isBooked = false
                    let bookingStatus = null
                    if (selectedDate && existingBookings.value.length > 0) {
                        const booking = existingBookings.value.find(b => b.bo_slot_id === slot.id)
                        if (booking && ['WP', 'CO', 'MT'].includes(booking.status)) {
                            isBooked = true
                            bookingStatus = booking.status
                        }
                    }
                    
                    return {
                        ...slot,
                        price,
                        pricePerPerson,
                        capacity,
                        isPerPerson,
                        isBooked,
                        bookingStatus
                    }
                }));
                
                // Tambahkan opsi "All Day" di awal array (hanya untuk non per-person slots)
                const regularSlots = slotsWithPrice.filter(s => !s.isPerPerson);
                const totalPrice = regularSlots.reduce((sum, slot) => sum + slot.price, 0);
                const hasBookedSlot = regularSlots.some(s => s.isBooked)
                
                const allDayOption = {
                    id: 'all_day',
                    name: 'All Day (Negotiable)',
                    start_time: '00:00',
                    end_time: '23:59',
                    description: 'Book all available slots for the day',
                    price: totalPrice,
                    isAllDay: true,
                    isPerPerson: false,
                    isBooked: hasBookedSlot,
                    bookingStatus: hasBookedSlot ? 'UNAVAILABLE' : null
                }
                
                availableSlots.value = regularSlots.length > 0 
                    ? [allDayOption, ...slotsWithPrice]
                    : slotsWithPrice;
                    
                return availableSlots.value;
            }
        }
        
        toast.add({severity:'warn', summary:'Warning', detail:'No slots available for this venue', life: 3000})
        availableSlots.value = []
        return []
        
    } catch(err) {
        console.error('Error fetching slots:', err)
        toast.add({severity:'error', summary:'Error', detail:'Failed to fetch slots'})
        availableSlots.value = []
        return []
    } finally {
        isLineLoading.value = false
    }
}

const addLine = async () => {
    if(!form.value.bo_venue_id) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select venue first', life: 3000})
        return
    }
    
    // Fetch available slots
    await fetchAvailableSlots(form.value.bo_venue_id)
    
    // Reset line form
    lineForm.value = {
        bo_booking_id: form.value.id,
        bo_slot_id: null,
        tanggal: new Date(),
        price: 0,
        jumlah_orang: 1,
        harga_per_orang: 0
    }
    
    isAllDaySelected.value = false
    originalAllDayPrice.value = 0
    
    showLineDialog.value = true
}

const onSlotChange = async (slotId) => {
    if (!lineForm.value.tanggal) {
        toast.add({severity:'warn', summary:'Warning', detail:'Pilih tanggal terlebih dahulu', life: 3000})
        lineForm.value.bo_slot_id = null
        return
    }
    
    await loadExistingBookingsForDate(form.value.bo_venue_id, lineForm.value.tanggal)
    
    const existingBooking = existingBookings.value.find(b => 
        b.bo_slot_id === slotId && ['WP', 'CO', 'MT'].includes(b.status)
    )
    if (existingBooking) {
        let statusText = 'dibooking'
        if (existingBooking.status === 'WP') statusText = 'menunggu pembayaran'
        if (existingBooking.status === 'CO') statusText = 'sudah terkonfirmasi'
        if (existingBooking.status === 'MT') statusText = 'dalam maintenance'
        toast.add({severity:'warn', summary:'Slot Tidak Tersedia', detail:`Slot ini ${statusText}`, life: 3000})
        lineForm.value.bo_slot_id = null
        return
    }
    
    const alreadySelected = [...tempDataline.value, ...tempJoggingLines.value].find(line => 
        line.bo_slot_id === slotId && 
        new Date(line.tanggal).toISOString().slice(0,10) === new Date(lineForm.value.tanggal).toISOString().slice(0,10)
    )
    if (alreadySelected) {
        toast.add({severity:'warn', summary:'Slot Sudah Dipilih', detail:'Slot ini sudah ada dalam booking Anda', life: 3000})
        lineForm.value.bo_slot_id = null
        return
    }
    
    const selectedSlot = availableSlots.value.find(s => s.id === slotId)
    if(selectedSlot) {
        // Update price saat tanggal berubah
        if (lineForm.value.tanggal && form.value.bo_venue_id) {
            const priceInfo = await adminBookingService.getSlotPrice(
                form.value.bo_venue_id, 
                slotId, 
                lineForm.value.tanggal
            );
            
            if (selectedSlot.isPerPerson) {
                lineForm.value.harga_per_orang = priceInfo.pricePerPerson;
                lineForm.value.price = priceInfo.pricePerPerson * (lineForm.value.jumlah_orang || 1);
                lineForm.value.capacity = priceInfo.capacity;
            } else {
                lineForm.value.price = priceInfo.price;
            }
        } else {
            lineForm.value.price = selectedSlot.price;
            if (selectedSlot.isPerPerson) {
                lineForm.value.harga_per_orang = selectedSlot.pricePerPerson;
                lineForm.value.capacity = selectedSlot.capacity;
            }
        }
        
        lineForm.value.bo_slot_id = slotId;
        lineForm.value.isPerPerson = selectedSlot.isPerPerson;
        
        // Set flag jika All Day dipilih
        if(selectedSlot.isAllDay) {
            isAllDaySelected.value = true
            originalAllDayPrice.value = selectedSlot.price
        } else {
            isAllDaySelected.value = false
            originalAllDayPrice.value = 0
        }
    }
}

// Watch untuk update harga saat tanggal berubah
watch(() => lineForm.value.tanggal, async (newDate) => {
    if (newDate && form.value.bo_venue_id) {
        lineForm.value.bo_slot_id = null
        isAllDaySelected.value = false
        originalAllDayPrice.value = 0
        await fetchAvailableSlots(form.value.bo_venue_id, newDate);
        if (lineForm.value.bo_slot_id) {
            await onSlotChange(lineForm.value.bo_slot_id);
        }
    }
});

// Watch untuk update harga saat jumlah orang berubah
watch(() => lineForm.value.jumlah_orang, (newValue) => {
    if (lineForm.value.isPerPerson && lineForm.value.harga_per_orang) {
        lineForm.value.price = lineForm.value.harga_per_orang * (newValue || 1);
    }
});

const saveLine = async () => {
    if(!lineForm.value.bo_slot_id) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select a slot', life: 3000})
        return
    }
    
    if(!lineForm.value.tanggal) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select a booking date', life: 3000})
        return
    }
    
    const selectedSlot = availableSlots.value.find(s => s.id === lineForm.value.bo_slot_id)
    
    if(!selectedSlot) {
        toast.add({severity:'error', summary:'Error', detail:'Slot not found'})
        return
    }
    
    // Validasi untuk per-person slots
    if (selectedSlot.isPerPerson) {
        if (!lineForm.value.jumlah_orang || lineForm.value.jumlah_orang < 1) {
            toast.add({severity:'warn', summary:'Warning', detail:'Please enter number of people', life: 3000})
            return
        }
        
        // Check availability
        const capacity = await adminBookingService.getSlotCapacity(selectedSlot.id, lineForm.value.tanggal);
        const currentBooked = capacity.data || 0;
        const remaining = lineForm.value.capacity - currentBooked;
        
        if (lineForm.value.jumlah_orang > remaining) {
            toast.add({
                severity:'warn', 
                summary:'Warning', 
                detail:`Only ${remaining} spots available. Currently ${currentBooked} people booked.`, 
                life: 3000
            })
            return
        }
    }
    
    // Jika All Day dipilih, save semua regular slots
    if(selectedSlot.isAllDay) {
        const regularSlots = availableSlots.value.filter(s => !s.isPerPerson && !s.isAllDay && !s.isBooked)
        if (regularSlots.length === 0) {
            toast.add({severity:'warn', summary:'All Day Tidak Tersedia', detail:'Semua slot sudah dibooking untuk tanggal ini', life: 3000})
            return
        }
        const totalSlots = regularSlots.length
        const pricePerSlot = lineForm.value.price / totalSlots
        
        regularSlots.forEach(slot => {
            const newLine = {
                temp_id: Date.now() + Math.random(),
                bo_slot_id: slot.id,
                tanggal: lineForm.value.tanggal,
                price: pricePerSlot,
                slot_data: slot
            }
            tempDataline.value.push(newLine)
        })
        
        toast.add({severity:'success', summary:'Success', detail:`Added ${totalSlots} slots for all day booking`, life: 3000})
    } 
    // Jika per-person, save ke tempJoggingLines
    else if (selectedSlot.isPerPerson) {
        const newLine = {
            temp_id: Date.now(),
            bo_slot_id: lineForm.value.bo_slot_id,
            tanggal: lineForm.value.tanggal,
            jumlah_orang: lineForm.value.jumlah_orang,
            harga_per_orang: lineForm.value.harga_per_orang,
            price: lineForm.value.price,
            slot_data: selectedSlot
        }
        tempJoggingLines.value.push(newLine)
        toast.add({severity:'success', summary:'Success', detail:'Booking line added', life: 3000})
    } 
    // Regular slot
    else {
        const newLine = {
            temp_id: Date.now(),
            bo_slot_id: lineForm.value.bo_slot_id,
            tanggal: lineForm.value.tanggal,
            price: lineForm.value.price,
            slot_data: selectedSlot
        }
        tempDataline.value.push(newLine)
        toast.add({severity:'success', summary:'Success', detail:'Booking line added', life: 3000})
    }
    
    // Reset form
    const currentDate = lineForm.value.tanggal
    lineForm.value = {
        bo_booking_id: form.value.id,
        bo_slot_id: null,
        tanggal: currentDate,
        price: 0,
        jumlah_orang: 1,
        harga_per_orang: 0
    }
    
    isAllDaySelected.value = false
    originalAllDayPrice.value = 0
    
    await fetchAvailableSlots(form.value.bo_venue_id, currentDate)
}

const saveLineAndClose = async () => {
    await saveLine()
    if (lineForm.value.bo_slot_id === null) {
        showLineDialog.value = false
    }
}

const deleteLine = (line) => {
    confirm.require({
        message: 'Delete this booking line?',
        header: 'Delete Confirmation',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: 'Delete',
            severity: 'danger'
        },
        accept: () => {
            // Jika ada temp_id, artinya belum disave, hapus dari temp array
            if(line.temp_id) {
                // Cek apakah di tempDataline atau tempJoggingLines
                let index = tempDataline.value.findIndex(l => l.temp_id === line.temp_id)
                if(index > -1) {
                    tempDataline.value.splice(index, 1)
                    toast.add({severity:'success', summary:'Success', detail:'Line removed', life: 3000})
                    return
                }
                
                index = tempJoggingLines.value.findIndex(l => l.temp_id === line.temp_id)
                if(index > -1) {
                    tempJoggingLines.value.splice(index, 1)
                    toast.add({severity:'success', summary:'Success', detail:'Line removed', life: 3000})
                    return
                }
            } 
            // Jika ada id (dari DB), hapus dari database
            else if(line.id) {
                isLineLoading.value = true
                
                // Cek apakah line ini punya jumlah_orang (jogging line)
                const isJoggingLine = line.hasOwnProperty('jumlah_orang');
                const serviceToUse = isJoggingLine ? new RestService('bo_bookingline_jogging') : svcline;
                
                serviceToUse.delete(line.id).then(async result => {
                    if(result.error){
                        toast.add({severity:'error', summary:'Error', detail:result.error.message, life: 3000})
                    } else {
                        toast.add({severity:'success', summary:'Success', detail:'Line deleted', life: 3000})
                        await fetchBookingLines(form.value.id)
                    }
                    isLineLoading.value = false
                }).catch(err => {
                    toast.add({severity:'error', summary:'Error', detail:err})
                    isLineLoading.value = false
                })
            }
        }
    })
}

const onRefresh = ()=>{
    isloading.value = true
    svc.list(0,250,props.sortby).then(e=>{
        data.value = e.data
        isloading.value = false
    }).catch(err=>{
        isloading.value = false
        toast.add({severity:'error',summary:'Error',detail:err})
    })
}

const exportCSV = async () => {
    // Get data to export (filtered or all)
    const dataToExport = selectedVenue.value ? filteredData.value : data.value
    
    if (!dataToExport || dataToExport.length === 0) {
        toast.add({severity:'warn', summary:'Warning', detail:'No data to export', life: 3000})
        return
    }
    
    // Prepare CSV data with resolved names
    const csvData = await Promise.all(dataToExport.map(async row => {
        const resolvedRow = {}
        
        for (const col of props.columns) {
            if (col.type === 'options' && row[col.field]) {
                // Resolve ID to name
                resolvedRow[col.name] = refvalue.value[col.field]?.[row[col.field]] || row[col.field]
            } else if (col.type === 'date' || col.type === 'datetime') {
                resolvedRow[col.name] = row[col.field] ? new Date(row[col.field]).toLocaleString('id-ID') : ''
            } else if (col.type === 'currency') {
                resolvedRow[col.name] = row[col.field] || 0
            } else if (col.type === 'boolean') {
                resolvedRow[col.name] = row[col.field] ? 'Yes' : 'No'
            } else {
                resolvedRow[col.name] = row[col.field] || ''
            }
        }
        
        return resolvedRow
    }))
    
    // Convert to CSV string
    const headers = props.columns.map(col => col.name).join(',')
    const rows = csvData.map(row => {
        return props.columns.map(col => {
            const value = row[col.name]
            // Escape commas and quotes in values
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`
            }
            return value
        }).join(',')
    })
    
    const csv = [headers, ...rows].join('\n')
    
    // Download CSV
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    const filename = selectedVenue.value 
        ? `${selectedVenue.value.name}_orders_${new Date().toISOString().split('T')[0]}.csv`
        : `all_orders_${new Date().toISOString().split('T')[0]}.csv`
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
};

onMounted(async ()=>{
    tabledata.value = props.columns.filter(d=>{
        return d.showintable
    })

    props.columns.forEach(d=>{
        if(d.type=='options'){
            // Jika ada staticOptions, langsung pakai tanpa fetch ke API
            if(d.source.staticOptions) {
                let opts = d.source.staticOptions
                if (d.source.visibleOptions) {
                    opts = opts.filter(o => d.source.visibleOptions.includes(o.id))
                }

                // untuk dropdown
                references.value[d.field] = opts
                let xv = {}
                d.source.staticOptions.forEach(e=>{
                    xv = {...xv, [e.id]: e[d.source.labelfield]}
                })
                refvalue.value[d.field] = xv
                return  // skip, jangan buat RestService
            }

            // Guard: skip jika model tidak ada
            if(!d.source.model) return

            // Fetch dari DB
            const refsvc = new RestService(d.source.model)
            refsvc.list(0, 1000).then(r=>{
                if(r.data){
                    references.value[d.field] = r.data
                    let xv = {}
                    r.data.forEach(e=>{
                        xv = {...xv,[e.id]:e[d.source.labelfield]}
                    })
                    refvalue.value[d.field] = xv
                }
            }).catch(err => {
                console.error('Error loading options:', err)
            })
        }
    })

    await loadVenues()
    onRefresh()
})

// Computed untuk menggabungkan semua lines (regular + jogging + temp)
const allDisplayLines = computed(() => {
    let allLines = [];
    
    // Tambahkan dataline yang sudah tersimpan
    if (isupdating.value && dataline.value) {
        allLines = [...dataline.value];
    }
    
    // Tambahkan tempDataline
    if (tempDataline.value) {
        allLines = [...allLines, ...tempDataline.value];
    }
    
    // Tambahkan tempJoggingLines
    if (tempJoggingLines.value) {
        allLines = [...allLines, ...tempJoggingLines.value];
    }
    
    return allLines;
});

// Computed untuk grouping lines berdasarkan tanggal
const linesByDate = computed(() => {
    const grouped = {};
    
    allDisplayLines.value.forEach(line => {
        const dateKey = line.tanggal ? new Date(line.tanggal).toLocaleDateString('id-ID') : 'No Date';
        
        if (!grouped[dateKey]) {
            grouped[dateKey] = {
                date: line.tanggal,
                dateFormatted: dateKey,
                lines: [],
                total: 0
            };
        }
        
        grouped[dateKey].lines.push(line);
        grouped[dateKey].total += line.price || 0;
    });
    
    // Convert object to array and sort by date
    return Object.values(grouped).sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
    });
});



</script>
<template>
    <div class="flex items-center justify-between p-2 mb-4 space-x-2">
        <div class="flex items-center gap-3">
            <Button 
                v-if="!showVenueList && listview" 
                @click="{showVenueList=true;selectedVenue=null}" 
                icon="pi pi-arrow-left" 
                variant="text"
                severity="secondary"
            ></Button>
            <h2 class="text-3xl font-bold">
                {{ showVenueList ? props.title : selectedVenue?.name }}
            </h2>
        </div>
        <div class="flex flex-wrap gap-2">
            <Button v-if="listview && !showVenueList" @click="exportCSV" icon="pi pi-download" variant="text"></Button>
            <Button v-if="listview && !showVenueList" @click="onRefresh" icon="pi pi-refresh" variant="text"></Button>
            <Button v-if="listview && !showVenueList" @click="onAdd" severity="primary" icon="pi pi-plus" :label="$t('Create Order')"></Button>
            <Button v-if="!listview" @click="{listview=true;isupdating=false;form={};tempDataline=[];tempJoggingLines=[];existingBookings=[]}" :disabled="isloading" severity="secondary" :label="$t('Cancel')" variant="outlined"></Button>
            <Button v-if="!listview" @click="onSave" :disabled="isloading" severity="success" :label="$t('Save')" class="ml-3"></Button>
        </div>
    </div>
    <div class="bg-white rounded">
        <!-- Venue Cards List -->
        <div v-if="listview && showVenueList" class="p-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div 
                    v-for="venue in venues" 
                    :key="venue.id"
                    @click="selectedVenue = venue; showVenueList = false"
                    class="bg-white border rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                >
                    <img 
                        v-if="venue.image1" 
                        :src="venue.image1" 
                        :alt="venue.name"
                        class="w-full h-48 object-cover"
                    />
                    <div 
                        v-else
                        class="w-full h-48 bg-gradient-to-br from-blue-400 to-blue-600"
                    ></div>
                    <div class="p-4">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-semibold text-lg">{{ venue.name }}</h3>
                            <span 
                                v-if="venue.pricing_type"
                                class="text-xs px-2 py-1 rounded"
                                :class="venue.pricing_type === 'per_person' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
                            >
                                {{ venue.pricing_type === 'per_person' ? 'Per Person' : 'Per Slot' }}
                            </span>
                        </div>
                        <p class="text-gray-600 text-sm mt-1">{{ venue.description }}</p>
                        <div class="flex justify-between items-center mt-3">
                            <button class="text-blue-600 text-sm font-medium">
                                View Orders →
                            </button>
                            <span class="text-xs px-2 py-1 rounded bg-green-100 text-green-800">
                                {{ data?.filter(d => d.bo_venue_id === venue.id).length || 0 }} orders
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Orders Table -->
        <div v-if="listview && !showVenueList">
            <Table :value="filteredData" ref="dt" resizableColumns columnResizeMode="fit" sortMode="multiple" :loading="isloading" paginator :rows="25" :rowsPerPageOptions="[10, 25, 50, 100]">
                <template #header v-if="props.searchfield">
                    <div class="flex flex-wrap justify-between">
                        <IconField>
                            <InputIcon class="pi pi-search"/>
                            <InputText v-model="q" :placeholder="$t('Search')"/>
                        </IconField>
                    </div>
                </template>
                <template #empty>No {{ props.title }} found.</template>
                <template #loading>Loading {{ props.title }}. Please wait.</template>
                <Column v-for="col of tabledata" :key="col.field" :field="col.field" :header="col.name" :sortable="col.sortable">
                    <template v-if="col.type=='boolean'" #body="slotProps">
                        <i class="pi" :class="slotProps.data[col.field]?'pi-check text-green-500':'pi-times text-red-500'"></i>
                    </template>
                    <template v-if="col.type=='date'" #body="slotProps">
                        {{ new Date(slotProps.data[col.field]).toLocaleString('id-ID') }}
                    </template>
                    <template v-if="col.type=='datetime'" #body="slotProps">
                        {{ new Date(slotProps.data[col.field]).toLocaleString('id-ID') }}
                    </template>
                    <template v-if="col.type=='currency'" #body="slotProps">
                        <div class="text-right">{{ formatCurrency(slotProps.data[col.field]) }}</div>
                    </template>
                    <template v-if="col.type=='options'" #body="slotProps">
                        {{ refvalue[col.field]?refvalue[col.field][slotProps.data[col.field]]:slotProps.data[col.field] }}
                    </template>
                </Column>
                <Column header="Action">
                    <template #body="slotProps">
                        <Button v-if="props.canedit" icon="pi pi-pencil" @click="onEdit(slotProps.data)" severity="success" variant="text"></Button>
                        <Button v-if="props.candelete" icon="pi pi-trash" @click="onDelete(slotProps.data)" severity="danger" variant="text"></Button>
                    </template>
                </Column>
            </Table>
        </div>
        <!-- Order Form -->
        <div v-if="!listview" class="p-6">
            <div class="mb-6">
                <span class="pb-3 text-xl font-bold">{{isupdating?$t('Edit'):$t('Create New')}} {{ props.entity }}</span>
            </div>
            <div class="flex flex-wrap my-2">
                <template v-for="col of props.columns">
                    <!-- Tampilkan field yang isdisplayed === true -->
                    <div v-if="col.isdisplayed === true" class="flex flex-col w-1/3 gap-2 pr-5 my-2">
                        <template v-if="col.type=='text' || col.type=='string'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <InputText :id="col.name" v-model="form[col.field]" :disabled="col.readonly" />
                        </template>
                        <template v-if="col.type=='date'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <DatePicker :id="col.name" v-model="form[col.field]" :disabled="col.readonly" dateFormat="dd/mm/yy"/>
                        </template>
                        <template v-if="col.type=='currency'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <InputNumber :id="col.name" v-model="form[col.field]" :disabled="col.readonly" mode="currency" currency="IDR" locale="id-ID" />
                        </template>
                        <template v-if="col.type=='boolean'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <ToggleSwitch :id="col.name" v-model="form[col.field]" :disabled="col.readonly"></ToggleSwitch>
                        </template>
                        <template v-if="col.type=='options'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <Dropdown :id="col.name" v-model="form[col.field]" :options="references[col.field]" :optionLabel="col.source.labelfield" optionValue="id" :disabled="col.readonly"></Dropdown>
                        </template>
                    </div>
                </template>
            </div>
            <div class="mt-5"><span class="text-red">(*) Mandatory field</span></div>
            
            <div class="mt-8">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">Booking Lines</h3>
                    <Button 
                        @click="addLine" 
                        severity="primary" 
                        icon="pi pi-plus" 
                        :label="$t('Add Line')"
                        :disabled="!form.bo_venue_id"
                    ></Button>
                </div>
                
                <!-- Summary Card -->
                <div class="p-4 mb-4 bg-blue-50 rounded-lg">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <div class="text-sm text-gray-600">Total Lines</div>
                            <div class="text-2xl font-bold">{{ allDisplayLines.length }}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-600">Grand Total</div>
                            <div class="text-2xl font-bold text-green-600">{{ formatCurrency(calculatedGrandTotal) }}</div>
                        </div>
                    </div>
                </div>
                
                <!-- Grouped by Date -->
                <div v-if="linesByDate.length === 0" class="p-8 text-center text-gray-500 bg-gray-50 rounded">
                    No booking lines found.
                </div>
                
                <div v-for="dateGroup in linesByDate" :key="dateGroup.dateFormatted" class="mb-6">
                    <!-- Date Header -->
                    <div class="flex items-center justify-between p-3 mb-2 bg-gray-100 rounded-lg">
                        <div class="flex items-center gap-3">
                            <i class="text-xl pi pi-calendar text-primary"></i>
                            <div>
                                <div class="font-bold text-gray-800">{{ dateGroup.dateFormatted }}</div>
                                <div class="text-sm text-gray-600">{{ dateGroup.lines.length }} slot(s)</div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm text-gray-600">Total</div>
                            <div class="font-bold text-green-600">{{ formatCurrency(dateGroup.total) }}</div>
                        </div>
                    </div>
                    
                    <!-- Slots Table for this date -->
                    <div class="overflow-x-auto">
                        <Table :value="dateGroup.lines" class="min-w-full">
                            <Column header="Slot Name" class="whitespace-nowrap">
                                <template #body="slotProps">
                                    {{ slotProps.data.slot_data?.name || dataslot[slotProps.data.bo_slot_id]?.name || '-' }}
                                </template>
                            </Column>

                            <Column header="Time" class="whitespace-nowrap">
                                <template #body="slotProps">
                                    {{ slotProps.data.slot_data?.start_time || dataslot[slotProps.data.bo_slot_id]?.start_time || '-' }}
                                    -
                                    {{ slotProps.data.slot_data?.end_time || dataslot[slotProps.data.bo_slot_id]?.end_time || '-' }}
                                </template>
                            </Column>
                            
                            <Column header="Type" class="whitespace-nowrap">
                                <template #body="slotProps">
                                    <Tag v-if="slotProps.data.jumlah_orang" severity="info" value="Per Person"></Tag>
                                    <Tag v-else severity="success" value="Full Slot"></Tag>
                                </template>
                            </Column>
                            
                            <Column header="People" class="whitespace-nowrap">
                                <template #body="slotProps">
                                    <span v-if="slotProps.data.jumlah_orang">{{ slotProps.data.jumlah_orang }} people</span>
                                    <span v-else>-</span>
                                </template>
                            </Column>
                            
                            <Column field="price" header="Price" class="whitespace-nowrap">
                                <template #body="slotProps">
                                    <div class="text-right">{{ formatCurrency(slotProps.data.price) }}</div>
                                </template>
                            </Column>
                            
                            <Column header="Action" class="whitespace-nowrap">
                                <template #body="slotProps">
                                    <Button icon="pi pi-trash" @click="deleteLine(slotProps.data)" severity="danger" variant="text"></Button>
                                </template>
                            </Column>
                        </Table>
                    </div>
                </div>
            </div>

            <Dialog v-model:visible="showLineDialog" modal header="Add Booking Line" :style="{ width: '35rem' }">
                <div class="flex flex-col gap-4">
                    <div class="flex flex-col gap-2">
                        <label for="bookingdate">Booking Date <span class="text-red">*</span></label>
                        <DatePicker 
                            id="tanggal" 
                            v-model="lineForm.tanggal" 
                            dateFormat="dd/mm/yy"
                            placeholder="Select booking date"
                        />
                    </div>
                    
                    <div class="flex flex-col gap-2">
                        <label for="slot">Slot <span class="text-red">*</span></label>
                        <Dropdown 
                            id="slot" 
                            v-model="lineForm.bo_slot_id" 
                            :options="availableSlots.filter(s => !s.isBooked)" 
                            optionLabel="name" 
                            optionValue="id"
                            :loading="isLineLoading"
                            @change="onSlotChange(lineForm.bo_slot_id)"
                            placeholder="Select a slot"
                        >
                            <template #option="slotProps">
                                <div class="flex justify-between w-full">
                                    <span :class="slotProps.option.isBooked ? 'text-gray-400 line-through' : ''">
                                        <strong v-if="slotProps.option.isAllDay">{{ slotProps.option.name }}</strong>
                                        <template v-else>
                                            {{ slotProps.option.name }}
                                            <span v-if="!slotProps.option.isPerPerson">
                                                ({{ slotProps.option.start_time }} - {{ slotProps.option.end_time }})
                                            </span>
                                            <Tag v-if="slotProps.option.isPerPerson" severity="info" value="Per Person" class="ml-2"></Tag>
                                        </template>
                                    </span>
                                    <span class="font-bold">
                                        {{ slotProps.option.isPerPerson 
                                            ? formatCurrency(slotProps.option.pricePerPerson) + '/person' 
                                            : formatCurrency(slotProps.option.price) 
                                        }}
                                        <span v-if="slotProps.option.isBooked" class="ml-2 text-xs text-red-600">
                                            ({{ slotProps.option.bookingStatus }})
                                        </span>
                                    </span>
                                </div>
                            </template>
                        </Dropdown>
                    </div>
                    
                    <!-- Show jumlah orang untuk per-person slots -->
                    <div v-if="lineForm.isPerPerson" class="flex flex-col gap-2">
                        <label for="jumlah_orang">Number of People <span class="text-red">*</span></label>
                        <InputNumber 
                            id="jumlah_orang" 
                            v-model="lineForm.jumlah_orang" 
                            :min="1"
                            :max="lineForm.capacity"
                        />
                        <small v-if="lineForm.capacity" class="text-gray-600">
                            Maximum capacity: {{ lineForm.capacity }} people
                        </small>
                    </div>
                    
                    <div class="flex flex-col gap-2">
                        <label for="price">
                            Price 
                            <span v-if="isAllDaySelected" class="text-blue-600">(Negotiable)</span>
                            <span v-else-if="lineForm.isPerPerson" class="text-gray-600">(Auto calculated)</span>
                        </label>
                        <InputNumber 
                            id="price" 
                            v-model="lineForm.price" 
                            :disabled="!isAllDaySelected && lineForm.isPerPerson" 
                            mode="currency" 
                            currency="IDR" 
                            locale="id-ID" 
                        />
                        <small v-if="isAllDaySelected" class="text-gray-600">
                            Original price: {{ formatCurrency(originalAllDayPrice) }} - You can adjust the price
                        </small>
                        <small v-if="lineForm.isPerPerson && !isAllDaySelected" class="text-gray-600">
                            {{ formatCurrency(lineForm.harga_per_orang) }} × {{ lineForm.jumlah_orang }} people
                        </small>
                    </div>
                </div>
                
                <template #footer>
                    <div class="flex justify-between w-full">
                        <Button label="Close" severity="secondary" @click="showLineDialog = false" outlined />
                        <div class="flex gap-2">
                            <Button label="Add & Continue" @click="saveLine" :loading="isLineLoading" outlined />
                            <Button label="Add & Close" @click="saveLineAndClose" :loading="isLineLoading" />
                        </div>
                    </div>
                </template>
            </Dialog>
        </div>
    </div>
</template>