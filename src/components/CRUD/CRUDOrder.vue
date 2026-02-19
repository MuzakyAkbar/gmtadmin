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
const selectedSlotIds = ref([])
const perPersonForm = ref({})

// Venue filter
const venues = ref([])
const selectedVenue = ref(null)
const filteredData = computed(() => {
    if (!selectedVenue.value) return data.value
    return data.value?.filter(d => d.bo_venue_id === selectedVenue.value.id) || []
})

// Manual total override
const manualTotal = ref(null)
const isManualTotal = ref(false)

// Additional charges (bo_booking_charge table)
const svcCharge = new RestService('bo_booking_charge')
const charges = ref([])           // charges yang sudah tersimpan di DB (saat edit)
const tempCharges = ref([])       // charges baru yang belum tersimpan
const chargeForm = ref({ keterangan: '', amount: null })
const showChargeDialog = ref(false)
const isEditingCharge = ref(false)
const editingChargeId = ref(null)

// Load existing charges saat edit
const loadCharges = async (bookingId) => {
    if (!bookingId) return
    const res = await svcCharge.listwhere(0, 100, [
        { field: 'bo_booking_id', op: 'eq', value: bookingId },
        { field: 'isactive', op: 'eq', value: true }
    ])
    charges.value = res.data || []
}

// Semua charges (saved + temp) untuk display
const allCharges = computed(() => [...charges.value, ...tempCharges.value])
const totalCharges = computed(() => allCharges.value.reduce((s, c) => s + (c.amount || 0), 0))

const openAddCharge = () => {
    chargeForm.value = { keterangan: '', amount: null }
    isEditingCharge.value = false
    editingChargeId.value = null
    showChargeDialog.value = true
}

const openEditCharge = (charge) => {
    chargeForm.value = { keterangan: charge.keterangan, amount: charge.amount }
    isEditingCharge.value = true
    editingChargeId.value = charge.id || charge.temp_id
    showChargeDialog.value = true
}

const saveCharge = () => {
    if (!chargeForm.value.keterangan || !chargeForm.value.amount) {
        toast.add({ severity: 'warn', summary: 'Warning', detail: 'Keterangan dan jumlah wajib diisi', life: 3000 })
        return
    }
    if (isEditingCharge.value) {
        // Update in temp or saved array
        const tempIdx = tempCharges.value.findIndex(c => c.temp_id === editingChargeId.value)
        if (tempIdx > -1) {
            tempCharges.value[tempIdx] = { ...tempCharges.value[tempIdx], ...chargeForm.value }
        } else {
            const savedIdx = charges.value.findIndex(c => c.id === editingChargeId.value)
            if (savedIdx > -1) charges.value[savedIdx] = { ...charges.value[savedIdx], ...chargeForm.value }
        }
    } else {
        tempCharges.value.push({ temp_id: Date.now() + Math.random(), ...chargeForm.value })
    }
    showChargeDialog.value = false
}

const deleteCharge = (charge) => {
    confirm.require({
        message: 'Hapus biaya tambahan ini?',
        header: 'Konfirmasi',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'Batal', severity: 'secondary', outlined: true },
        acceptProps: { label: 'Hapus', severity: 'danger' },
        accept: async () => {
            if (charge.temp_id) {
                tempCharges.value = tempCharges.value.filter(c => c.temp_id !== charge.temp_id)
            } else if (charge.id) {
                await svcCharge.delete(charge.id)
                charges.value = charges.value.filter(c => c.id !== charge.id)
                // Recalculate grandtotal after delete
                form.value.grandtotal = calculatedGrandTotal.value
                if (isupdating.value) {
                    await svc.update(form.value.id, { grandtotal: form.value.grandtotal })
                }
                toast.add({ severity: 'success', summary: 'Dihapus', detail: 'Biaya tambahan dihapus', life: 2000 })
            }
        }
    })
}

// Computed untuk total harga dari lines saja
const linesTotalPrice = computed(() => {
    let total = 0;
    if (tempDataline.value) total += tempDataline.value.reduce((sum, l) => sum + (l.price || 0), 0);
    if (tempJoggingLines.value) total += tempJoggingLines.value.reduce((sum, l) => sum + (l.price || 0), 0);
    if (isupdating.value && dataline.value) {
        total += dataline.value.reduce((sum, l) => sum + (l.price || 0), 0);
    }
    return total;
});

// Grand total = base (lines atau manual) + all charges
const calculatedGrandTotal = computed(() => {
    const base = isManualTotal.value && manualTotal.value !== null ? manualTotal.value : linesTotalPrice.value;
    return base + totalCharges.value;
});

const pricePerLine = computed(() => {
    const totalLines = allDisplayLines.value.length;
    if (!isManualTotal.value || !manualTotal.value || totalLines === 0) return null;
    return Math.round(manualTotal.value / totalLines);
});

watch([manualTotal, isManualTotal], () => {
    if (!isManualTotal.value || manualTotal.value === null) return;
    const totalLines = allDisplayLines.value.length;
    if (totalLines === 0) return;
    const perLine = Math.round(manualTotal.value / totalLines);
    tempDataline.value.forEach(l => { l.price = perLine });
    tempJoggingLines.value.forEach(l => { l.price = perLine });
});

watch([tempDataline, tempJoggingLines, tempCharges, charges], () => {
    form.value.grandtotal = calculatedGrandTotal.value;
}, { deep: true });

const loadExistingBookingsForDate = async (venueId, date) => {
    if (!venueId || !date) {
        existingBookings.value = []
        return
    }
    try {
        const dateStr = new Date(date).toISOString().slice(0, 10)
        // bo_bookingline tidak punya bo_venue_id, filter lewat bo_booking dulu
        const bookingWhere = [
            { field: 'bo_venue_id', op: 'eq', value: venueId },
            { field: 'isactive', op: 'eq', value: true }
        ]
        const bookingResult = await svc.listwhere(0, 500, bookingWhere)
        const bookingIds = bookingResult.data ? bookingResult.data.map(b => b.id) : []
        if (bookingIds.length === 0) {
            existingBookings.value = []
            return
        }
        const lineWhere = [
            { field: 'bo_booking_id', op: 'in', value: bookingIds },
            { field: 'tanggal', op: 'eq', value: dateStr },
            { field: 'isactive', op: 'eq', value: true }
        ]
        const result = await svcline.listwhere(0, 250, lineWhere)
        if (result.data && result.data.length > 0) {
            existingBookings.value = result.data.map(line => {
                const booking = bookingResult.data.find(b => b.id === line.bo_booking_id)
                return { ...line, status: booking?.status || 'UNKNOWN' }
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
    const result = await svcvenue.list(0, 100, [{ col: 'seqno', asc: true }])
    if (result.data) {
        venues.value = result.data.filter(v => v.isactive)
    }
}

// Computed: group venues by category
const venuesByCategory = computed(() => {
    const grouped = {}
    venues.value.forEach(venue => {
        const cat = venue.category || ''
        if (!grouped[cat]) grouped[cat] = []
        grouped[cat].push(venue)
    })
    // Sort: named categories first (alphabetically), uncategorized last
    const entries = Object.entries(grouped)
    entries.sort(([a], [b]) => {
        if (!a && b) return 1
        if (a && !b) return -1
        return a.localeCompare(b)
    })
    return entries // [ [categoryName, [venues...]], ... ]
})

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
    tempCharges.value = []
    charges.value = []
    manualTotal.value = null
    isManualTotal.value = false
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
                status: form.value.status,
                bo_kategori_pendapatan_id: form.value.bo_kategori_pendapatan_id || null,
                bo_kategori_olahraga_id: form.value.bo_kategori_olahraga_id || null,
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
                bo_kategori_pendapatan_id: form.value.bo_kategori_pendapatan_id || null,
                bo_kategori_olahraga_id: form.value.bo_kategori_olahraga_id || null,
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
            
            // Save new charges
            if (tempCharges.value.length > 0) {
                for (const charge of tempCharges.value) {
                    await svcCharge.add({
                        bo_booking_id: newBookingId,
                        keterangan: charge.keterangan,
                        amount: charge.amount,
                        isactive: true
                    })
                }
            }
            
            toast.add({severity:'success',summary:'Success',detail:'Booking created successfully', life: 3000})
        }
        
        // Save new charges on update too
        if (isupdating.value && tempCharges.value.length > 0) {
            for (const charge of tempCharges.value) {
                await svcCharge.add({
                    bo_booking_id: form.value.id,
                    keterangan: charge.keterangan,
                    amount: charge.amount,
                    isactive: true
                })
            }
        }
        
        // Update saved charges that were edited in-place
        for (const charge of charges.value.filter(c => c.id)) {
            await svcCharge.update(charge.id, {
                keterangan: charge.keterangan,
                amount: charge.amount
            })
        }
        
        await onRefresh()
        listview.value = true
        isupdating.value = false
        form.value = {}
        tempDataline.value = []
        tempJoggingLines.value = []
        tempCharges.value = []
        charges.value = []
        manualTotal.value = null
        isManualTotal.value = false
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
    tempCharges.value = []
    charges.value = []
    manualTotal.value = null
    isManualTotal.value = false

    fetchBookingLines(item.id)
    loadCharges(item.id)
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
    selectedSlotIds.value = []
    perPersonForm.value = {}
    
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

const onToggleAllDay = async (checked) => {
    if (checked) {
        // Pilih semua regular slot yang tidak booked
        selectedSlotIds.value = availableSlots.value
            .filter(s => !s.isAllDay && !s.isPerPerson && !s.isBooked)
            .map(s => s.id)
    } else {
        selectedSlotIds.value = []
    }
}

const onToggleSlot = (slot) => {
    const idx = selectedSlotIds.value.indexOf(slot.id)
    if (idx > -1) {
        selectedSlotIds.value.splice(idx, 1)
    } else {
        // Jika memilih per-person, pastikan jumlah_orang ada
        selectedSlotIds.value.push(slot.id)
        if (slot.isPerPerson && !perPersonForm.value[slot.id]) {
            perPersonForm.value[slot.id] = { jumlah_orang: 1, price: slot.pricePerPerson || 0 }
        }
    }
}

const onJumlahOrangChange = (slot) => {
    if (perPersonForm.value[slot.id]) {
        perPersonForm.value[slot.id].price = slot.pricePerPerson * (perPersonForm.value[slot.id].jumlah_orang || 1)
    }
}

const isAllRegularSelected = computed(() => {
    const regularSlots = availableSlots.value.filter(s => !s.isAllDay && !s.isPerPerson && !s.isBooked)
    return regularSlots.length > 0 && regularSlots.every(s => selectedSlotIds.value.includes(s.id))
})

const saveMultipleSlots = async () => {
    if (!lineForm.value.tanggal) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select a booking date', life: 3000})
        return
    }
    
    if (selectedSlotIds.value.length === 0) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select at least one slot', life: 3000})
        return
    }
    
    // Validasi per-person slots harus ada jumlah_orang
    for (const slotId of selectedSlotIds.value) {
        const slot = availableSlots.value.find(s => s.id === slotId)
        if (slot && slot.isPerPerson) {
            const pp = perPersonForm.value[slotId]
            if (!pp || !pp.jumlah_orang || pp.jumlah_orang < 1) {
                toast.add({severity:'warn', summary:'Warning', detail:`Please enter number of people for slot: ${slot.name}`, life: 3000})
                return
            }
        }
    }
    
    let addedCount = 0
    for (const slotId of selectedSlotIds.value) {
        const slot = availableSlots.value.find(s => s.id === slotId)
        if (!slot) continue
        
        // Skip jika sudah ada di temp lines
        const already = [...tempDataline.value, ...tempJoggingLines.value].find(line =>
            line.bo_slot_id === slotId &&
            new Date(line.tanggal).toISOString().slice(0,10) === new Date(lineForm.value.tanggal).toISOString().slice(0,10)
        )
        if (already) continue
        
        if (slot.isPerPerson) {
            const pp = perPersonForm.value[slotId]
            const jumlah = pp?.jumlah_orang || 1
            const priceInfo = await adminBookingService.getSlotPrice(form.value.bo_venue_id, slotId, lineForm.value.tanggal)
            tempJoggingLines.value.push({
                temp_id: Date.now() + Math.random(),
                bo_slot_id: slotId,
                tanggal: lineForm.value.tanggal,
                jumlah_orang: jumlah,
                harga_per_orang: priceInfo.pricePerPerson,
                price: priceInfo.pricePerPerson * jumlah,
                slot_data: slot
            })
        } else {
            const priceInfo = await adminBookingService.getSlotPrice(form.value.bo_venue_id, slotId, lineForm.value.tanggal)
            tempDataline.value.push({
                temp_id: Date.now() + Math.random(),
                bo_slot_id: slotId,
                tanggal: lineForm.value.tanggal,
                price: priceInfo.price,
                slot_data: slot
            })
        }
        addedCount++
    }
    
    if (addedCount > 0) {
        toast.add({severity:'success', summary:'Success', detail:`${addedCount} slot(s) added`, life: 3000})
    }
    
    showLineDialog.value = false
    selectedSlotIds.value = []
    perPersonForm.value = {}
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
    const sortParam = Array.isArray(props.sortby) ? props.sortby : (props.sortby ? [props.sortby] : [{col:'created',asc:false}])
    svc.list(0,250,sortParam).then(e=>{
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
    <div class="flex flex-wrap items-center justify-between p-2 mb-4 gap-2">
        <div class="flex items-center gap-2 min-w-0">
            <Button 
                v-if="!showVenueList && listview" 
                @click="{showVenueList=true;selectedVenue=null}" 
                icon="pi pi-arrow-left" 
                variant="text"
                severity="secondary"
                class="shrink-0"
            ></Button>
            <h2 class="text-xl sm:text-2xl md:text-3xl font-bold truncate">
                {{ showVenueList ? props.title : selectedVenue?.name }}
            </h2>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
            <Button v-if="listview && !showVenueList" @click="exportCSV" icon="pi pi-download" variant="text"></Button>
            <Button v-if="listview && !showVenueList" @click="onRefresh" icon="pi pi-refresh" variant="text"></Button>
            <Button v-if="listview && !showVenueList" @click="onAdd" severity="primary" icon="pi pi-plus" :label="$t('Create Order')"></Button>
            <Button v-if="!listview" @click="{listview=true;isupdating=false;form={};tempDataline=[];tempJoggingLines=[];tempCharges=[];charges=[];existingBookings=[];manualTotal=null;isManualTotal=false}" :disabled="isloading" severity="secondary" :label="$t('Cancel')" variant="outlined"></Button>
            <Button v-if="!listview" @click="onSave" :disabled="isloading" severity="success" :label="$t('Save')"></Button>
        </div>
    </div>
    <div class="bg-white rounded">
        <!-- Venue Cards List -->
        <div v-if="listview && showVenueList" class="p-3 sm:p-6">
            <div v-for="[category, categoryVenues] in venuesByCategory" :key="category" class="mb-8">
                <!-- Category Header -->
                <div v-if="category" class="flex items-center gap-3 mb-4">
                    <h3 class="text-base font-bold text-gray-700 uppercase tracking-wide">{{ category }}</h3>
                    <div class="flex-1 h-px bg-gray-200"></div>
                    <span class="text-xs text-gray-400">{{ categoryVenues.length }} venue(s)</span>
                </div>
                <div v-else class="flex items-center gap-3 mb-4">
                    <h3 class="text-base font-bold text-gray-400 uppercase tracking-wide">Other</h3>
                    <div class="flex-1 h-px bg-gray-200"></div>
                </div>

                <!-- Venue Cards in this category -->
                <!-- If category has multiple venues, show as courts (compact row) -->
                <div v-if="category && categoryVenues.length > 1" class="flex flex-wrap gap-3">
                    <div
                        v-for="(venue, idx) in categoryVenues"
                        :key="venue.id"
                        @click="selectedVenue = venue; showVenueList = false"
                        class="group relative overflow-hidden rounded-xl border hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer flex-1"
                        style="min-width:150px; max-width:220px"
                    >
                        <!-- Image / gradient -->
                        <div class="relative w-full h-32">
                            <img
                                v-if="venue.image1"
                                :src="venue.image1"
                                :alt="venue.name"
                                class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div v-else class="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600"></div>
                            <div class="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-all"></div>
                            <!-- Number badge -->
                            <div class="absolute top-2 left-2 w-7 h-7 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center">
                                <span class="text-white font-bold text-sm">{{ idx + 1 }}</span>
                            </div>
                        </div>
                        <!-- Info -->
                        <div class="p-3">
                            <div class="font-semibold text-sm">{{ venue.name }}</div>
                            <div class="flex items-center justify-between mt-2">
                                <span
                                    v-if="venue.pricing_type"
                                    class="text-xs px-2 py-0.5 rounded"
                                    :class="venue.pricing_type === 'per_person' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
                                >
                                    {{ venue.pricing_type === 'per_person' ? 'Per Person' : 'Per Slot' }}
                                </span>
                                <span class="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">
                                    {{ data?.filter(d => d.bo_venue_id === venue.id).length || 0 }} orders
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Single venue or uncategorized: full card layout -->
                <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div
                        v-for="venue in categoryVenues"
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
                        <Button icon="pi pi-pencil" @click="onEdit(slotProps.data)" severity="success" variant="text" v-tooltip="'Edit'"></Button>
                        <Button v-if="props.candelete" icon="pi pi-trash" @click="onDelete(slotProps.data)" severity="danger" variant="text" v-tooltip="'Delete'"></Button>
                    </template>
                </Column>
            </Table>
        </div>
        <!-- Order Form -->
        <div v-if="!listview" class="p-3 sm:p-6">
            <div class="mb-6">
                <span class="pb-3 text-lg sm:text-xl font-bold">{{isupdating?$t('Edit'):$t('Create New')}} {{ props.entity }}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 my-2">
                <template v-for="col of props.columns">
                    <!-- Tampilkan field yang isdisplayed === true -->
                    <div v-if="col.isdisplayed === true" class="flex flex-col gap-2">
                        <template v-if="col.type=='text' || col.type=='string'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <InputText :id="col.name" v-model="form[col.field]" :disabled="col.readonly" />
                        </template>
                        <template v-if="col.type=='date'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <DatePicker :id="col.name" v-model="form[col.field]" :disabled="col.readonly" dateFormat="dd/mm/yy" class="w-full"/>
                        </template>
                        <template v-if="col.type=='currency'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <InputNumber :id="col.name" v-model="form[col.field]" :disabled="col.readonly" mode="currency" currency="IDR" locale="id-ID" class="w-full"/>
                        </template>
                        <template v-if="col.type=='boolean'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <ToggleSwitch :id="col.name" v-model="form[col.field]" :disabled="col.readonly"></ToggleSwitch>
                        </template>
                        <template v-if="col.type=='options'">
                            <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                            <Dropdown :id="col.name" v-model="form[col.field]" :options="references[col.field]" :optionLabel="col.source.labelfield" optionValue="id" :disabled="col.readonly" :filter="!col.source.staticOptions" filterPlaceholder="Search..." class="w-full"></Dropdown>
                        </template>
                    </div>
                </template>
            </div>
            <div class="mt-5"><span class="text-red">(*) Mandatory field</span></div>
            
            <div class="mt-6 sm:mt-8">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-base sm:text-lg font-bold">Booking Lines</h3>
                    <Button 
                        @click="addLine" 
                        severity="primary" 
                        icon="pi pi-plus" 
                        :label="$t('Add Line')"
                        :disabled="!form.bo_venue_id"
                        size="small"
                    ></Button>
                </div>
                
                <!-- Summary Card -->
                <div class="p-4 mb-4 bg-blue-50 rounded-lg space-y-4">
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
                    
                    <!-- Manual Total Input -->
                    <div class="border-t border-blue-200 pt-3">
                        <div class="flex items-center gap-2 mb-2">
                            <ToggleSwitch v-model="isManualTotal" inputId="manual_toggle" />
                            <label for="manual_toggle" class="text-sm font-semibold text-gray-700 cursor-pointer">Input Total Harga Manual</label>
                        </div>
                        <div v-if="isManualTotal" class="space-y-1">
                            <InputNumber 
                                v-model="manualTotal" 
                                mode="currency" 
                                currency="IDR" 
                                locale="id-ID" 
                                class="w-full"
                                placeholder="Masukkan total harga manual..."
                            />
                            <div v-if="pricePerLine !== null && allDisplayLines.length > 0" class="text-xs text-blue-600">
                                = {{ formatCurrency(pricePerLine) }} × {{ allDisplayLines.length }} line(s)
                            </div>
                        </div>
                    </div>
                    
                    <!-- Additional Charges Table -->
                    <div class="border-t border-blue-200 pt-3">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-sm font-semibold text-gray-700">Biaya Tambahan</span>
                            <Button 
                                icon="pi pi-plus" 
                                label="Tambah" 
                                size="small" 
                                severity="warning" 
                                variant="outlined"
                                @click="openAddCharge"
                            />
                        </div>
                        
                        <div v-if="allCharges.length === 0" class="text-xs text-gray-400 italic py-1">
                            Belum ada biaya tambahan
                        </div>
                        
                        <div v-else class="rounded-lg border border-amber-200 overflow-hidden text-sm">
                            <div 
                                v-for="charge in allCharges" 
                                :key="charge.id || charge.temp_id"
                                class="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-amber-100 last:border-b-0"
                            >
                                <div class="flex items-center gap-2 flex-1 min-w-0">
                                    <i class="pi pi-tag text-amber-500 shrink-0"></i>
                                    <span class="text-gray-700 truncate">{{ charge.keterangan }}</span>
                                    <Tag v-if="charge.temp_id" severity="warn" value="Belum disimpan" class="text-xs shrink-0" />
                                </div>
                                <div class="flex items-center gap-2 ml-2 shrink-0">
                                    <span class="font-bold text-amber-700">+{{ formatCurrency(charge.amount) }}</span>
                                    <Button icon="pi pi-pencil" size="small" severity="secondary" variant="text" @click="openEditCharge(charge)" />
                                    <Button icon="pi pi-trash" size="small" severity="danger" variant="text" @click="deleteCharge(charge)" />
                                </div>
                            </div>
                            <!-- Total charges row -->
                            <div class="flex justify-between items-center px-3 py-2 bg-amber-100 font-bold text-sm border-t border-amber-200">
                                <span class="text-amber-800">Total Biaya Tambahan</span>
                                <span class="text-amber-700">+{{ formatCurrency(totalCharges) }}</span>
                            </div>
                        </div>
                        
                        <!-- Grand total breakdown -->
                        <div v-if="allCharges.length > 0" class="mt-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200 text-sm">
                            <div class="flex justify-between text-gray-600 mb-1">
                                <span>Harga Slot</span>
                                <span>{{ formatCurrency(linesTotalPrice) }}</span>
                            </div>
                            <div class="flex justify-between text-amber-700 mb-1">
                                <span>Biaya Tambahan</span>
                                <span>+{{ formatCurrency(totalCharges) }}</span>
                            </div>
                            <div class="flex justify-between font-bold text-green-700 pt-1 border-t border-green-200">
                                <span>Grand Total</span>
                                <span>{{ formatCurrency(calculatedGrandTotal) }}</span>
                            </div>
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
                    <!-- Mobile: card list -->
                    <div class="block sm:hidden divide-y border rounded-lg overflow-hidden">
                        <div 
                            v-for="line in dateGroup.lines" 
                            :key="line.temp_id || line.id"
                            class="flex items-center justify-between p-3 bg-white"
                        >
                            <div class="flex-1 min-w-0">
                                <div class="font-medium text-sm truncate">
                                    {{ line.slot_data?.name || dataslot[line.bo_slot_id]?.name || '-' }}
                                </div>
                                <div class="text-xs text-gray-500 mt-0.5">
                                    {{ line.slot_data?.start_time || dataslot[line.bo_slot_id]?.start_time || '' }}
                                    {{ (line.slot_data?.start_time || dataslot[line.bo_slot_id]?.start_time) ? '-' : '' }}
                                    {{ line.slot_data?.end_time || dataslot[line.bo_slot_id]?.end_time || '' }}
                                </div>
                                <div class="flex items-center gap-2 mt-1">
                                    <Tag v-if="line.jumlah_orang" severity="info" :value="`${line.jumlah_orang} people`" class="text-xs"></Tag>
                                    <Tag v-else severity="success" value="Full Slot" class="text-xs"></Tag>
                                    <span class="text-sm font-semibold text-green-600">{{ formatCurrency(line.price) }}</span>
                                </div>
                            </div>
                            <Button icon="pi pi-trash" @click="deleteLine(line)" severity="danger" variant="text" size="small" class="ml-2 shrink-0"></Button>
                        </div>
                    </div>
                    <!-- Desktop: table -->
                    <div class="hidden sm:block overflow-x-auto">
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

            <!-- Add/Edit Charge Dialog -->
            <Dialog v-model:visible="showChargeDialog" modal :header="isEditingCharge ? 'Edit Biaya Tambahan' : 'Tambah Biaya Tambahan'" :style="{ width: 'min(95vw, 28rem)' }">
                <div class="flex flex-col gap-4 py-2">
                    <div class="flex flex-col gap-1">
                        <label class="text-sm font-semibold">Keterangan <span class="text-red">*</span></label>
                        <InputText 
                            v-model="chargeForm.keterangan" 
                            placeholder="Contoh: Biaya peralatan, setup panggung, kebersihan..."
                            class="w-full"
                            autofocus
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-sm font-semibold">Jumlah (Rp) <span class="text-red">*</span></label>
                        <InputNumber 
                            v-model="chargeForm.amount" 
                            mode="currency" 
                            currency="IDR" 
                            locale="id-ID" 
                            class="w-full"
                            placeholder="Masukkan jumlah..."
                        />
                    </div>
                </div>
                <template #footer>
                    <div class="flex justify-between w-full">
                        <Button label="Batal" severity="secondary" variant="outlined" @click="showChargeDialog = false" />
                        <Button :label="isEditingCharge ? 'Simpan Perubahan' : 'Tambahkan'" icon="pi pi-check" @click="saveCharge" />
                    </div>
                </template>
            </Dialog>

            <Dialog v-model:visible="showLineDialog" modal header="Add Booking Line" :style="{ width: 'min(95vw, 38rem)' }">
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
                        <label>Slot <span class="text-red">*</span></label>
                        <div v-if="isLineLoading" class="flex items-center gap-2 text-gray-500 p-2">
                            <i class="pi pi-spin pi-spinner"></i> Loading slots...
                        </div>
                        <div v-else-if="availableSlots.length === 0" class="text-gray-500 p-2">
                            No slots available.
                        </div>
                        <div v-else class="border rounded-lg overflow-hidden">
                            <!-- Select All Regular Slots -->
                            <div 
                                class="flex items-center justify-between px-3 py-2 bg-gray-100 border-b cursor-pointer hover:bg-gray-200"
                                @click.stop="onToggleAllDay(!isAllRegularSelected)"
                            >
                                <div class="flex items-center gap-3">
                                    <input 
                                        type="checkbox" 
                                        :checked="isAllRegularSelected" 
                                        @change.stop="onToggleAllDay($event.target.checked)"
                                        class="w-4 h-4 accent-blue-600 cursor-pointer"
                                    />
                                    <span class="font-bold text-gray-700">All Day (select all regular slots)</span>
                                </div>
                                <span class="text-sm text-gray-500">
                                    {{ availableSlots.filter(s => !s.isAllDay && !s.isPerPerson && !s.isBooked).length }} slots
                                </span>
                            </div>
                            
                            <!-- Slot list (exclude All Day option) -->
                            <div class="max-h-52 sm:max-h-64 overflow-y-auto divide-y">
                                <div 
                                    v-for="slot in availableSlots.filter(s => !s.isAllDay)" 
                                    :key="slot.id"
                                    class="flex items-center justify-between px-3 py-2"
                                    :class="slot.isBooked ? 'opacity-50 bg-gray-50' : 'hover:bg-blue-50 cursor-pointer'"
                                    @click="!slot.isBooked && onToggleSlot(slot)"
                                >
                                    <div class="flex items-center gap-3 flex-1">
                                        <input 
                                            type="checkbox"
                                            :checked="selectedSlotIds.includes(slot.id)"
                                            :disabled="slot.isBooked"
                                            @change.stop="!slot.isBooked && onToggleSlot(slot)"
                                            class="w-4 h-4 accent-blue-600 cursor-pointer"
                                            :class="slot.isBooked ? 'cursor-not-allowed' : ''"
                                        />
                                        <div class="flex-1">
                                            <div class="flex items-center gap-2">
                                                <span :class="slot.isBooked ? 'line-through text-gray-400' : ''">
                                                    {{ slot.name }}
                                                    <span v-if="!slot.isPerPerson" class="text-gray-500 text-sm">
                                                        ({{ slot.start_time }} - {{ slot.end_time }})
                                                    </span>
                                                </span>
                                                <Tag v-if="slot.isPerPerson" severity="info" value="Per Person" class="text-xs"></Tag>
                                                <Tag v-if="slot.isBooked" severity="danger" :value="slot.bookingStatus" class="text-xs"></Tag>
                                            </div>
                                            <!-- Input jumlah orang untuk per-person slot yang dipilih -->
                                            <div v-if="slot.isPerPerson && selectedSlotIds.includes(slot.id)" class="mt-1 flex items-center gap-2" @click.stop>
                                                <small class="text-gray-600">People:</small>
                                                <InputNumber 
                                                    v-model="perPersonForm[slot.id].jumlah_orang"
                                                    :min="1"
                                                    :max="slot.capacity"
                                                    inputClass="w-20 text-sm p-1"
                                                    @input="onJumlahOrangChange(slot)"
                                                />
                                                <small class="text-gray-500">/ {{ slot.capacity }}</small>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="text-right ml-3 shrink-0">
                                        <span class="font-bold text-sm">
                                            {{ slot.isPerPerson 
                                                ? formatCurrency(slot.pricePerPerson) + '/orang' 
                                                : formatCurrency(slot.price) 
                                            }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Summary selected -->
                        <div v-if="selectedSlotIds.length > 0" class="p-2 bg-blue-50 rounded text-sm text-blue-700">
                            <strong>{{ selectedSlotIds.length }}</strong> slot(s) selected
                        </div>
                    </div>
                </div>
                
                <template #footer>
                    <div class="flex justify-between w-full">
                        <Button label="Close" severity="secondary" @click="showLineDialog = false" outlined />
                        <Button 
                            label="Add Selected" 
                            icon="pi pi-check"
                            @click="saveMultipleSlots" 
                            :loading="isLineLoading" 
                            :disabled="selectedSlotIds.length === 0"
                        />
                    </div>
                </template>
            </Dialog>
        </div>
    </div>
</template>