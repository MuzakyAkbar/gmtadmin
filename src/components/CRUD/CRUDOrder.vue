<script setup>
import { onMounted, ref } from 'vue';
import { DatePicker, useToast, Dialog } from 'primevue';
import { useConfirm } from 'primevue';
import {useI18n} from 'vue-i18n';
import {formatCurrency} from '../../composables/formater'
import RestService from '../../services/rest';
import { create } from 'ol/transform';

const props = defineProps(['entity','objectname','child1name','title','columns','searchfield','details','sortby','candelete','canedit'])
const i18n = useI18n()
const toast = useToast();
const confirm = useConfirm()

const svc = new RestService(props.objectname);
const svcline = new RestService(props.child1name);
const svcslot = new RestService('bo_slot');
const svcpayment = new RestService('bo_payment');

const listview = ref(true)
const isloading = ref(true)
const isupdating = ref(false)
const data = ref()
const dt = ref()
const tabledata = ref()
const form = ref({})
const references = ref([])
const refvalue = ref([])
const dataline = ref()
const dataslot = ref()
const svcprice = new RestService('bo_price');
const availableSlots = ref([])
const lineForm = ref({})
const showLineDialog = ref(false)
const isLineLoading = ref(false)
const tempDataline = ref([])
const isAllDaySelected = ref(false)
const originalAllDayPrice = ref(0)


const onAdd = async ()=>{
    isloading.value = true

    form.value = {
        status:'CO',
        created: new Date().toISOString(),
        bookingdate: new Date().toISOString(),
    }
    
    isupdating.value = false
    listview.value = false
    dataline.value = []
    dataslot.value = []
    tempDataline.value = [] 
    
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
            payment_method: 'admin',
            payment_channel: 'admin',
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
    
    if(tempDataline.value.length === 0 && !isupdating.value) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please add at least one booking line', life: 3000})
        return
    }
    
    isloading.value = true
    
    try {
        if(isupdating.value){
            // Update booking header
            const updateResult = await svc.update(form.value.id, form.value)
            
            if(updateResult.error){
                toast.add({severity:'error',summary:'Error',detail:updateResult.error.message, life: 3000})
                isloading.value = false
                return
            }
            
            // Jika ada new lines di temp, save ke DB
            if(tempDataline.value.length > 0) {
                let lineData = []
                for(const line of tempDataline.value) {
                    lineData.push ({
                        bo_booking_id: form.value.id,
                        bo_slot_id: line.bo_slot_id,
                        tanggal: line.tanggal,
                        price: line.price
                    })
                    
                }
                await svcline.add(lineData)
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
            console.log('Saving booking:', form.value)
            const bookingResult = await svc.add(form.value)
            
            if(bookingResult.error){
                toast.add({severity:'error',summary:'Error',detail:bookingResult.error.message, life: 3000})
                isloading.value = false
                return
            }
            
            // Get booking ID yang baru dibuat
            const newBookingId = bookingResult.data[0].id
            
            // Insert semua booking lines
            if(tempDataline.value.length > 0) {
                let lineData = []
                for(const line of tempDataline.value) {
                    lineData.push ({
                        bo_booking_id: newBookingId,
                        bo_slot_id: line.bo_slot_id,
                        tanggal: line.tanggal,
                        price: line.price
                    })
                    
                }
                await svcline.add(lineData)
            }
            
            // Create payment
            try {
                await createPayment(newBookingId, form.value.bo_user_id, form.value.grandtotal || 0)
                toast.add({severity:'success',summary:'Success',detail:'Booking and payment created successfully', life: 3000})
            } catch(paymentErr) {
                console.error('Payment error:', paymentErr)
                toast.add({severity:'warn',summary:'Warning',detail:'Booking created but payment creation failed', life: 3000})
            }
        }
        
        // Reset dan refresh
        await onRefresh()
        listview.value = true
        isupdating.value = false
        form.value = {}
        tempDataline.value = []
        
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
            }
        ]
        
        try {
            const result = await svcline.listwhere(0, 250, whereclause)
            dataline.value = result.data
            
            // Fetch slots untuk setiap booking line
            if(result.data && result.data.length > 0){
                await fetchSlots(result.data)
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

const fetchAvailableSlots = async (venueId) => {
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
                }
            ]
            
            const slotResult = await svcslot.listwhere(0, 250, slotWhere, {col: 'seqno', ascending: true})
            
            if(slotResult.data) {
                // Combine slot with price info
                const slotsWithPrice = slotResult.data.map(slot => {
                    const price = priceResult.data.find(p => p.bo_slot_id === slot.id)
                    return {
                        ...slot,
                        price: price?.amount || 0,
                        bo_price_id: price?.id
                    }
                })
                
                // Tambahkan opsi "All Day" di awal array
                const totalPrice = slotsWithPrice.reduce((sum, slot) => sum + slot.price, 0)
                const allDayOption = {
                    id: 'all_day',
                    name: 'All Day',
                    start_time: '00:00',
                    end_time: '23:59',
                    description: 'Book all available slots for the day',
                    price: totalPrice,
                    isAllDay: true
                }
                
                availableSlots.value = [allDayOption, ...slotsWithPrice]
                return [allDayOption, ...slotsWithPrice]
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
    }
    
    isAllDaySelected.value = false
    originalAllDayPrice.value = 0
    
    showLineDialog.value = true
}

const onSlotChange = (slotId) => {
    const selectedSlot = availableSlots.value.find(s => s.id === slotId)
    if(selectedSlot) {
        lineForm.value.price = selectedSlot.price
        lineForm.value.bo_slot_id = slotId
        
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
    
    // Jika memilih "All Day", tambahkan semua slot untuk tanggal tersebut
    if(selectedSlot.isAllDay) {
        // Filter hanya slot yang bukan "All Day"
        const regularSlots = availableSlots.value.filter(s => !s.isAllDay)
        
        // Hitung harga per slot berdasarkan harga total yang di-nego
        const negotiatedTotalPrice = lineForm.value.price
        const originalTotalPrice = originalAllDayPrice.value
        const priceRatio = negotiatedTotalPrice / originalTotalPrice
        
        let totalAdded = 0
        regularSlots.forEach(slot => {
            // Harga slot disesuaikan dengan ratio negosiasi
            const adjustedPrice = Math.round(slot.price * priceRatio)
            
            const newLine = {
                temp_id: Date.now() + Math.random(), // ID unik untuk setiap line
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
            
            form.value.grandtotal = (form.value.grandtotal || 0) + adjustedPrice
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
        
        tempDataline.value.push(newLine)
        
        // Update dataslot untuk display
        if(!dataslot.value[selectedSlot.id]) {
            dataslot.value[selectedSlot.id] = selectedSlot
        }
        
        form.value.grandtotal = (form.value.grandtotal || 0) + lineForm.value.price
        
        toast.add({severity:'success', summary:'Success', detail:'Line added to cart', life: 3000})
    }
    
    showLineDialog.value = false
    lineForm.value = {}
    isAllDaySelected.value = false
    originalAllDayPrice.value = 0
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
            reduceGrandTotal(line.price)
            if(line.temp_id) {
                const index = tempDataline.value.findIndex(l => l.temp_id === line.temp_id)
                if(index > -1) {
                    tempDataline.value.splice(index, 1)
                    toast.add({severity:'success', summary:'Success', detail:'Line removed', life: 3000})
                }
            } 
            // Jika ada id (dari DB), hapus dari database
            else if(line.id) {
                isLineLoading.value = true
                svcline.delete(line.id).then(async result => {
                    if(result.error){
                        toast.add({severity:'error', summary:'Error', detail:result.error.message, life: 3000})
                    } else {
                        toast.add({severity:'success', summary:'Success', detail:'Line deleted', life: 3000})
                        await fetchBookingLines(form.value.id)
                    }
                    isLineLoading.value = false
                })
            }
        }
    })
}

const reduceGrandTotal = (price) => {
    const val = Number(price) || 0
    form.value.grandtotal = Math.max(0, (Number(form.value.grandtotal) || 0) - val)
}

const onRefresh = ()=>{
    isloading.value = true
    svc.list(0,25,props.sortby).then(e=>{
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
            
            // Filter yang isactive = true
            const whereclause = [
                {
                    field: 'isactive',
                    op: 'eq',
                    value: true
                }
            ]
            
            // Gunakan listwhere dengan filter isactive
            refsvc.listwhere(0, 250, whereclause).then(r=>{
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

    onRefresh()
})

</script>
<template>
    <div class="flex items-center justify-between p-2 mb-4 space-x-2">
        <h2 class="text-3xl font-bold">{{ props.title }}</h2>
        <div class="flex flex-wrap gap-2">
            <Button v-if="listview" @click="exportCSV" icon="pi pi-download" variant="text"></Button>
            <Button v-if="listview" @click="onRefresh" icon="pi pi-refresh" variant="text"></Button>
            <Button v-if="listview" @click="onAdd" severity="primary" icon="pi pi-plus" :label="$t('Add')"></Button>
            <Button v-if="!listview" @click="{listview=true;isupdating=false;form={}}" :disabled="isloading" severity="secondary" :label="$t('Cancel')" variant="outlined"></Button>
            <Button v-if="!listview" @click="onSave" :disabled="isloading" severity="success" :label="$t('Save')" class="ml-3"></Button>
        </div>
    </div>
    <div class="bg-white rounded ">
        <div v-if="listview">
            <Table :value="data" ref="dt" resizableColumns columnResizeMode="fit" sortMode="multiple" :loading="isloading">
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
                        <!-- Tambahkan kondisi isdisplayed di sini -->
                        <div v-if="col.isdisplayed !== false" class="flex flex-col w-1/3 gap-2 pr-5 my-2">
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
                                <Dropdown :id="col.name" v-model="form[col.field]" :options="references[col.field]" :optionLabel="col.source.labelfield" optionValue="id" :disabled="col.readonly"></Dropdown>
                            </template>
                        </div>
                    </template>
                </div>
                <div class="mt-5"><span class="text-red">(*) Mandatory field</span></div>
                {{ props.details }}
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
                    <Table :value="isupdating ? dataline : tempDataline" :loading="isloading">
                        <template #empty>No booking lines found.</template>
                        <template #loading>Loading booking lines...</template>

                        <Column header="Tanggal">
                            <template #body="slotProps">
                                {{ slotProps.data.tanggal ? new Date(slotProps.data.tanggal).toLocaleDateString('id-ID') : '-' }}
                            </template>
                        </Column>

                        <Column header="Slot Name">
                            <template #body="slotProps">
                                {{ slotProps.data.slot_data?.name || dataslot[slotProps.data.bo_slot_id]?.name || '-' }}
                            </template>
                        </Column>

                        <Column header="Jam Mulai">
                            <template #body="slotProps">
                                {{ slotProps.data.slot_data?.start_time || dataslot[slotProps.data.bo_slot_id]?.start_time || '-' }}
                            </template>
                        </Column>
                        <Column header="Jam Selesai">
                            <template #body="slotProps">
                                {{ slotProps.data.slot_data?.end_time || dataslot[slotProps.data.bo_slot_id]?.end_time || '-' }}
                            </template>
                        </Column>
                        <Column header="Description">
                            <template #body="slotProps">
                                {{ slotProps.data.slot_data?.description || dataslot[slotProps.data.bo_slot_id]?.description || '-' }}
                            </template>
                        </Column>
                        
                        <Column field="price" header="Price">
                            <template #body="slotProps">
                                <div class="text-right">{{ formatCurrency(slotProps.data.price) }}</div>
                            </template>
                        </Column>
                        
                        <Column header="Action">
                            <template #body="slotProps">
                                <Button icon="pi pi-trash" @click="deleteLine(slotProps.data)" severity="secondary" variant="text"></Button>
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
                                                {{ slotProps.option.name }} ({{ slotProps.option.start_time }} - {{ slotProps.option.end_time }})
                                            </template>
                                        </span>
                                        <span class="font-bold">{{ formatCurrency(slotProps.option.price) }}</span>
                                    </div>
                                </template>
                            </Dropdown>
                        </div>
                        
                        <div class="flex flex-col gap-2">
                            <label for="price">
                                Price 
                                <span v-if="isAllDaySelected" class="text-blue-600">(Negotiable)</span>
                            </label>
                            <InputNumber 
                                id="price" 
                                v-model="lineForm.price" 
                                :disabled="!isAllDaySelected" 
                                mode="currency" 
                                currency="IDR" 
                                locale="id-ID" 
                            />
                            <small v-if="isAllDaySelected" class="text-gray-600">
                                Original price: {{ formatCurrency(originalAllDayPrice) }} - You can adjust the price
                            </small>
                        </div>
                    </div>
                    
                    <template #footer>
                        <Button label="Cancel" severity="secondary" @click="showLineDialog = false" outlined />
                        <Button label="Save" @click="saveLine" :loading="isLineLoading" />
                    </template>
                </Dialog>
                <div class="mt-5" v-if="props.details">
                    <Tabs value="0">
                        <TabList>
                            <Tab value="0">Header I</Tab>
                            <Tab value="1">Header II</Tab>
                            <Tab value="2">Header III</Tab>
                        </TabList>
                        <TabPanels>
                            <TabPanel value="0">
                                <p class="m-0">
                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
                                    consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
                                </p>
                            </TabPanel>
                            <TabPanel value="1">
                                <p class="m-0">
                                    Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim
                                    ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Consectetur, adipisci velit, sed quia non numquam eius modi.
                                </p>
                            </TabPanel>
                            <TabPanel value="2">
                                <p class="m-0">
                                    At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa
                                    qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus.
                                </p>
                            </TabPanel>
                        </TabPanels>
                    </Tabs>
                </div>
            </div>
        </div>
    </div>
</template>