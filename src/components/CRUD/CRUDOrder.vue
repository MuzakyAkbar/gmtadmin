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
const adminBookingService = new AdminBookingService();

const listview = ref(true)
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


const onAdd = async ()=>{
    isloading.value = true

    form.value = {
        status:'CO',
        created: new Date().toISOString(),
        bookingdate: new Date().toISOString(),
        grandtotal: 0,
        original_total: 0,
        discount_amount: 0
    }
    
    isupdating.value = false
    listview.value = false
    dataline.value = []
    dataslot.value = {}
    tempDataline.value = [] 
    tempJoggingLines.value = []
    
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
                }));
                
                await svcline.add(lineData)
            }
            
            // Jika ada new jogging lines di temp, save ke DB
            if(tempJoggingLines.value.length > 0) {
                const svcJogging = new RestService('bo_bookingline_jogging');
                let joggingData = tempJoggingLines.value.map(line => ({
                    bo_booking_id: form.value.id,
                    bo_venue_id: form.value.bo_venue_id,
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    jumlah_orang: line.jumlah_orang,
                    harga_per_orang: line.harga_per_orang,
                    price: line.price,
                    isactive: true
                }));
                
                await svcJogging.add(joggingData)
            }
            
            // Create or update payment
            try {
                await createPayment(form.value.id, form.value.bo_user_id, form.value.grandtotal || 0)
                toast.add({severity:'success',summary:'Success',detail:'Booking and payment updated successfully', life: 3000})
            } catch(paymentErr) {
                console.error('Payment error:', paymentErr)
                toast.add({severity:'warn',summary:'Warning',detail:'Booking updated but payment creation failed', life: 3000})
            }
            
        } else {
            // Insert booking header
            const bookingData = {
                bo_venue_id: form.value.bo_venue_id,
                bo_user_id: form.value.bo_user_id,
                bookingdate: form.value.bookingdate,
                grandtotal: form.value.grandtotal,
                original_total: form.value.original_total || form.value.grandtotal,
                discount_amount: form.value.discount_amount || 0,
                bo_referral_id: form.value.bo_referral_id || null,
                lines: tempDataline.value.map(line => ({
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    price: line.price
                })),
                joggingLines: tempJoggingLines.value.map(line => ({
                    bo_slot_id: line.bo_slot_id,
                    tanggal: line.tanggal,
                    jumlah_orang: line.jumlah_orang,
                    harga_per_orang: line.harga_per_orang,
                    price: line.price
                }))
            };
            
            const result = await adminBookingService.createAdminBooking(bookingData);
            
            if(result.error){
                toast.add({severity:'error',summary:'Error',detail:result.error.message, life: 3000})
                isloading.value = false
                return
            }
            
            toast.add({severity:'success',summary:'Success',detail:'Booking created successfully', life: 3000})
        }
        
        // Reset dan refresh
        await onRefresh()
        listview.value = true
        isupdating.value = false
        form.value = {}
        tempDataline.value = []
        tempJoggingLines.value = []
        
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
    
    try {
        const result = await svcslot.listwhere(0, 250, whereclause)
        if(result.data){
            const slotMap = {}
            result.data.forEach(slot => {
                slotMap[slot.id] = slot
            })
            dataslot.value = slotMap
        }
    } catch(err) {
        console.error('Error fetching slots:', err)
    }
}

const fetchAvailableSlots = async (venueId, selectedDate = null) => {
    if(!venueId) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select venue first', life: 3000})
        return []
    }
    
    try {
        isLineLoading.value = true
        
        // Get prices untuk venue ini
        const whereclause = [
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
        
        const priceResult = await svcprice.listwhere(0, 250, whereclause)
        
        if(priceResult.data && priceResult.data.length > 0) {
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
                    
                    return {
                        ...slot,
                        price,
                        pricePerPerson,
                        capacity,
                        isPerPerson
                    }
                }));
                
                // Tambahkan opsi "All Day" di awal array (hanya untuk non per-person slots)
                const regularSlots = slotsWithPrice.filter(s => !s.isPerPerson);
                const totalPrice = regularSlots.reduce((sum, slot) => sum + slot.price, 0);
                
                const allDayOption = {
                    id: 'all_day',
                    name: 'All Day (Negotiable)',
                    start_time: '00:00',
                    end_time: '23:59',
                    description: 'Book all available slots for the day',
                    price: totalPrice,
                    isAllDay: true,
                    isPerPerson: false
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
    if (newDate && lineForm.value.bo_slot_id && form.value.bo_venue_id) {
        await fetchAvailableSlots(form.value.bo_venue_id, newDate);
        await onSlotChange(lineForm.value.bo_slot_id);
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
                life: 4000
            })
            return
        }
    }
    
    // Jika memilih "All Day", tambahkan semua slot untuk tanggal tersebut
    if(selectedSlot.isAllDay) {
        // Filter hanya slot yang bukan "All Day" dan bukan per-person
        const regularSlots = availableSlots.value.filter(s => !s.isAllDay && !s.isPerPerson)
        
        // Hitung harga per slot berdasarkan harga total yang di-nego
        const negotiatedTotalPrice = lineForm.value.price
        const originalTotalPrice = originalAllDayPrice.value
        const priceRatio = negotiatedTotalPrice / originalTotalPrice
        
        let totalAdded = 0
        regularSlots.forEach(slot => {
            // Harga slot disesuaikan dengan ratio negosiasi
            const adjustedPrice = Math.round(slot.price * priceRatio)
            
            const newLine = {
                temp_id: Date.now() + Math.random(),
                bo_slot_id: slot.id,
                tanggal: new Date(lineForm.value.tanggal).toISOString(),
                price: adjustedPrice,
                slot_data: slot
            }
            
            tempDataline.value.push(newLine)
            
            // Update dataslot untuk display
            if(!dataslot.value[slot.id]) {
                dataslot.value[slot.id] = slot
            }
            
            totalAdded++
        })
        
        toast.add({
            severity:'success', 
            summary:'Success', 
            detail:`${totalAdded} slots added for ${new Date(lineForm.value.tanggal).toLocaleDateString('id-ID')} with negotiated price ${formatCurrency(negotiatedTotalPrice)}`, 
            life: 4000
        })
    } else {
        // Tambahkan single slot
        const newLine = {
            temp_id: Date.now(),
            bo_slot_id: lineForm.value.bo_slot_id,
            tanggal: new Date(lineForm.value.tanggal).toISOString(),
            price: lineForm.value.price,
            slot_data: selectedSlot
        }
        
        // Jika per-person slot, tambahkan ke jogging lines
        if (selectedSlot.isPerPerson) {
            newLine.jumlah_orang = lineForm.value.jumlah_orang;
            newLine.harga_per_orang = lineForm.value.harga_per_orang;
            tempJoggingLines.value.push(newLine);
        } else {
            tempDataline.value.push(newLine);
        }
        
        // Update dataslot untuk display
        if(!dataslot.value[selectedSlot.id]) {
            dataslot.value[selectedSlot.id] = selectedSlot
        }
        
        toast.add({severity:'success', summary:'Success', detail:'Line added successfully', life: 3000})
    }
    
    // Dialog tetap terbuka untuk tambah line lagi dengan tanggal yang sama
    // showLineDialog.value = false
    
    // Reset hanya slot dan price, tanggal tetap sama
    lineForm.value.bo_slot_id = null
    lineForm.value.price = 0
    lineForm.value.jumlah_orang = 1
    lineForm.value.harga_per_orang = 0
    lineForm.value.isPerPerson = false
    
    isAllDaySelected.value = false
    originalAllDayPrice.value = 0
}

const saveLineAndClose = async () => {
    await saveLine()
    if (!isLineLoading.value) {
        showLineDialog.value = false
        lineForm.value = {}
    }
}

const deleteLine = (line) => {
    confirm.require({
        message: i18n.t('Delete this line?'),
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

const exportCSV = () => {
    dt.value.exportCSV();
};

onMounted(()=>{
    tabledata.value = props.columns.filter(d=>{
        return d.showintable
    })

    props.columns.forEach(d=>{
        if(d.type=='options'){
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
            })
        }
    })

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

</script>
<template>
    <div class="flex items-center justify-between p-2 mb-4 space-x-2">
        <h2 class="text-3xl font-bold">{{ props.title }}</h2>
        <div class="flex flex-wrap gap-2">
            <Button v-if="listview" @click="exportCSV" icon="pi pi-download" variant="text"></Button>
            <Button v-if="listview" @click="onRefresh" icon="pi pi-refresh" variant="text"></Button>
            <Button v-if="listview" @click="onAdd" severity="primary" icon="pi pi-plus" :label="$t('Create Booking')"></Button>
            <Button v-if="!listview" @click="{listview=true;isupdating=false;form={};tempDataline=[];tempJoggingLines=[]}" :disabled="isloading" severity="secondary" :label="$t('Cancel')" variant="outlined"></Button>
            <Button v-if="!listview" @click="onSave" :disabled="isloading" severity="success" :label="$t('Save')" class="ml-3"></Button>
        </div>
    </div>
    <div class="bg-white rounded ">
        <div v-if="listview">
            <Table :value="data" ref="dt" resizableColumns columnResizeMode="fit" sortMode="multiple" :loading="isloading" paginator :rows="25" :rowsPerPageOptions="[10, 25, 50, 100]">
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
                        {{ refvalue[col.field]?refvalue[col.field][slotProps.data[col.field]]:'' }}
                    </template>
                </Column>
                <Column header="Action" :exportable="false" style="min-width: 1em;">
                    <template #body="slotProps">
                        <Button icon="pi pi-pencil" v-if="props.canedit===undefined||props.canedit==true" @click="onEdit(slotProps.data)" class="mr-2" variant="text"></Button>
                        <Button icon="pi pi-trash" v-if="props.candelete===undefined||props.candelete==true" @click="onDelete(slotProps.data)" severity="secondary" variant="text"></Button>
                    </template>
                </Column>
            </Table>
        </div>
        <div v-else>
            <div class="flex flex-col p-4">
                <div class="mb-3">
                    <span class="pb-3 text-xl font-bold">{{isupdating?$t('Edit'):$t('Create New')}} {{ props.entity }}</span>
                </div>
                <div class="flex flex-wrap my-2">
                    <template v-for="col of props.columns">
                        <div class="flex flex-col w-1/3 gap-2 pr-5 my-2" v-if="col.isdisplayed">
                            <template v-if="col.type=='string'">
                                <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                                <InputText :id="col.name" v-model="form[col.field]" :disabled="col.readonly" />
                            </template>
                            <template v-if="col.type=='date'">
                                <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                                <DatePicker :id="col.name" v-model="form[col.field]" :disabled="col.readonly" dateFormat="dd/mm/yy"/>
                            </template>
                            <template v-if="col.type=='currency'">
                                <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                                <InputNumber :id="col.name" v-model="form[col.field]" :disabled="col.readonly" />
                            </template>
                            <template v-if="col.type=='boolean'">
                                <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                                <ToggleSwitch :id="col.name" v-model="form[col.field]" :disabled="col.readonly"></ToggleSwitch>
                            </template>
                            <template v-if="col.type=='options'">
                                <label :for="col.name">{{ col.name }} <span v-if="col.required" class="text-red">*</span></label>
                                <Dropdown :id="col.name" v-model="form[col.field]" :options="references[col.field]" :optionLabel="col.source.labelfield" optionValue="id" :disabled="col.readonly" filter></Dropdown>
                            </template>
                        </div>
                    </template>
                </div>
                <div class="mt-5"><span class="text-red">(*) Mandatory field</span></div>
                
                <div class="mt-5">
                    <h3 class="mb-3 text-lg font-bold">Booking Lines</h3>
                    <div class="mb-3">
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
                        <div class="flex justify-between items-center">
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
                    
                    <Table :value="allDisplayLines" :loading="isloading">
                        <template #empty>No booking lines found.</template>
                        <template #loading>Loading booking lines...</template>

                        <Column header="Tanggal" style="min-width: 120px">
                            <template #body="slotProps">
                                {{ slotProps.data.tanggal ? new Date(slotProps.data.tanggal).toLocaleDateString('id-ID') : '-' }}
                            </template>
                        </Column>

                        <Column header="Slot Name" style="min-width: 150px">
                            <template #body="slotProps">
                                {{ slotProps.data.slot_data?.name || dataslot[slotProps.data.bo_slot_id]?.name || '-' }}
                            </template>
                        </Column>

                        <Column header="Time" style="min-width: 150px">
                            <template #body="slotProps">
                                {{ slotProps.data.slot_data?.start_time || dataslot[slotProps.data.bo_slot_id]?.start_time || '-' }}
                                -
                                {{ slotProps.data.slot_data?.end_time || dataslot[slotProps.data.bo_slot_id]?.end_time || '-' }}
                            </template>
                        </Column>
                        
                        <Column header="Type" style="min-width: 100px">
                            <template #body="slotProps">
                                <Tag v-if="slotProps.data.jumlah_orang" severity="info" value="Per Person"></Tag>
                                <Tag v-else severity="success" value="Full Slot"></Tag>
                            </template>
                        </Column>
                        
                        <Column header="People" style="min-width: 80px">
                            <template #body="slotProps">
                                <span v-if="slotProps.data.jumlah_orang">{{ slotProps.data.jumlah_orang }} people</span>
                                <span v-else>-</span>
                            </template>
                        </Column>
                        
                        <Column field="price" header="Price" style="min-width: 120px">
                            <template #body="slotProps">
                                <div class="text-right">{{ formatCurrency(slotProps.data.price) }}</div>
                            </template>
                        </Column>
                        
                        <Column header="Action" style="min-width: 80px">
                            <template #body="slotProps">
                                <Button icon="pi pi-trash" @click="deleteLine(slotProps.data)" severity="danger" variant="text"></Button>
                            </template>
                        </Column>
                    </Table>
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
                                :minDate="new Date()"
                            />
                        </div>
                        
                        <div class="flex flex-col gap-2">
                            <label for="slot">Slot <span class="text-red">*</span></label>
                            <Dropdown 
                                id="slot" 
                                v-model="lineForm.bo_slot_id" 
                                :options="availableSlots" 
                                optionLabel="name" 
                                optionValue="id"
                                :loading="isLineLoading"
                                @change="onSlotChange(lineForm.bo_slot_id)"
                                placeholder="Select a slot"
                            >
                                <template #option="slotProps">
                                    <div class="flex justify-between w-full">
                                        <span>
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
    </div>
</template>