<script setup>
import { onMounted, ref, watch, computed } from 'vue';
import { DatePicker, useToast, Dialog } from 'primevue';
import { useConfirm } from 'primevue';
import {useI18n} from 'vue-i18n';
import {formatCurrency, formatDateHuman} from '../../composables/formater'
import RestService from '../../services/rest';
import AdminBookingService from '../../services/AdminBookingService';
import BookingService from '../../services/booking';
import VueQrcode from 'vue-qrcode';
import { supabase } from '../../plugins/supabaseClient';

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
const svcBooking = new BookingService();

// Ticket dialog state
const showTicketDialog = ref(false)
const ticketData = ref(null)
const isLoadingTicket = ref(false)
const ticketBaseUrl = ref(window.location.origin)

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

// ─── CALENDAR LINE PICKER STATE ─────────────────────────────────────────────
const calMonth = ref(new Date().getMonth())
const calYear = ref(new Date().getFullYear())
const calDates = ref([])
const calSelectedDate = ref(null)      // tanggal yang sedang aktif (diklik)
const calSlotsByDate = ref({})         // cache: { 'YYYY-MM-DD': slotsArray }
const calLoadingDate = ref(null)       // tanggal yang sedang di-load
// Multi-slot selection per date: { 'YYYY-MM-DD': [ {slotId, isPerPerson, jumlah_orang, price, slot_data} ] }
const calSelectedSlots = ref({})
const calMtMode = ref(false)       // mode toggle maintenance
const calMtLoading = ref(null)     // 'dateStr-slotId' yang sedang di-proses

const calMonths = [
    'Januari','Februari','Maret','April','Mei','Juni',
    'Juli','Agustus','September','Oktober','November','Desember'
]

function formatTime(t) {
    if (!t) return ''
    return t.slice(0, 5)
}

function toLocalDateStr(date) {
    if (!date) return ''
    const d = date instanceof Date ? date : new Date(date)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
}

function generateCalDates(month, year) {
    calDates.value = []
    const lastDay = new Date(year, month + 1, 0).getDate()
    for (let i = 1; i <= lastDay; i++) {
        const d = new Date(year, month, i)
        calDates.value.push({
            date: d,
            dateStr: toLocalDateStr(d),
            dayname: d.toLocaleDateString('id-ID', { weekday: 'short' }),
            tgl: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
        })
    }
    // Auto-select first date (or today if in current month)
    if (calDates.value.length > 0) {
        const today = toLocalDateStr(new Date())
        const todayEntry = calDates.value.find(d => d.dateStr === today)
        selectCalDate(todayEntry || calDates.value[0])
    }
}

function prevCalMonth() {
    if (calMonth.value === 0) { calMonth.value = 11; calYear.value-- }
    else calMonth.value--
    generateCalDates(calMonth.value, calYear.value)
}
function nextCalMonth() {
    if (calMonth.value === 11) { calMonth.value = 0; calYear.value++ }
    else calMonth.value++
    generateCalDates(calMonth.value, calYear.value)
}

async function selectCalDate(dateObj) {
    calSelectedDate.value = dateObj
    const dateStr = dateObj.dateStr
    if (calSlotsByDate.value[dateStr]) return  // sudah di-cache
    calLoadingDate.value = dateStr
    try {
        await loadExistingBookingsForDate(form.value.bo_venue_id, dateObj.date)
        const slots = await fetchAvailableSlots(form.value.bo_venue_id, dateObj.date)
        // simpan copy existingBookings untuk tanggal ini
        calSlotsByDate.value[dateStr] = {
            slots: (slots || []).filter(s => !s.isAllDay),
            bookings: [...existingBookings.value]
        }
    } finally {
        calLoadingDate.value = null
    }
}

function getCalSlots(dateStr) {
    return calSlotsByDate.value[dateStr]?.slots || []
}

function getCalSlotStatus(dateStr, slot) {
    const bookings = calSlotsByDate.value[dateStr]?.bookings || []
    const booked = bookings.find(b => b.bo_slot_id === slot.id)
    if (booked && ['WP','CO','MT'].includes(booked.status)) return booked.status
    // Cek apakah sudah ada di tempLines
    const inTemp = [...tempDataline.value, ...tempJoggingLines.value].find(l =>
        l.bo_slot_id === slot.id && toLocalDateStr(new Date(l.tanggal)) === dateStr
    )
    if (inTemp) return 'ADDED'
    return null
}

function isCalSlotSelected(dateStr, slot) {
    return (calSelectedSlots.value[dateStr] || []).some(s => s.slotId === slot.id)
}

function getCalSlotClass(dateStr, slot) {
    const status = getCalSlotStatus(dateStr, slot)
    const selected = isCalSlotSelected(dateStr, slot)
    if (status === 'ADDED') return 'bg-green-600 text-white cursor-not-allowed opacity-80'
    if (selected) return 'bg-gradient-to-br from-[#0A0E4F] to-[#5B21B6] text-white shadow-lg scale-105 ring-2 ring-purple-400'
    if (status === 'CO') return 'bg-red-500 text-white cursor-not-allowed opacity-70'
    if (status === 'WP') return 'bg-yellow-400 text-gray-800 cursor-not-allowed opacity-70'
    if (status === 'MT') return 'bg-gray-500 text-white cursor-not-allowed opacity-80'
    return 'bg-white border-2 border-gray-200 text-gray-800 hover:border-purple-500 hover:bg-purple-50 hover:scale-105'
}

function toggleCalSlot(dateStr, slot, dateObj) {
    const status = getCalSlotStatus(dateStr, slot)
    if (['WP','CO','MT','ADDED'].includes(status)) return

    if (!calSelectedSlots.value[dateStr]) calSelectedSlots.value[dateStr] = []
    const idx = calSelectedSlots.value[dateStr].findIndex(s => s.slotId === slot.id)
    if (idx > -1) {
        calSelectedSlots.value[dateStr].splice(idx, 1)
        if (slot.isPerPerson && perPersonForm.value[`${dateStr}-${slot.id}`]) {
            delete perPersonForm.value[`${dateStr}-${slot.id}`]
        }
    } else {
        calSelectedSlots.value[dateStr].push({
            slotId: slot.id,
            isPerPerson: slot.isPerPerson,
            slot_data: slot,
            dateObj
        })
        if (slot.isPerPerson) {
            perPersonForm.value[`${dateStr}-${slot.id}`] = { jumlah_orang: 1 }
        }
    }
}

const calTotalSelected = computed(() => {
    return Object.values(calSelectedSlots.value).reduce((sum, arr) => sum + arr.length, 0)
})

const calTotalPrice = computed(() => {
    let total = 0
    Object.entries(calSelectedSlots.value).forEach(([dateStr, slots]) => {
        slots.forEach(s => {
            if (s.isPerPerson) {
                const pp = perPersonForm.value[`${dateStr}-${s.slotId}`]
                total += (s.slot_data.pricePerPerson || 0) * (pp?.jumlah_orang || 1)
            } else {
                total += s.slot_data.price || 0
            }
        })
    })
    return total
})

// All Day untuk tanggal yang sedang aktif (hanya slot regular, non-booked)
function isAllDayCalSelected(dateStr) {
    const slots = getCalSlots(dateStr).filter(s => !s.isPerPerson)
    if (slots.length === 0) return false
    return slots.every(s => {
        const status = getCalSlotStatus(dateStr, s)
        if (['WP','CO','MT','ADDED'].includes(status)) return true // skip blocked
        return isCalSlotSelected(dateStr, s)
    })
}

function toggleAllDayCal(dateStr, dateObj) {
    const slots = getCalSlots(dateStr).filter(s => !s.isPerPerson)
    const availSlots = slots.filter(s => !['WP','CO','MT','ADDED'].includes(getCalSlotStatus(dateStr, s)))
    if (availSlots.length === 0) return

    const allSelected = availSlots.every(s => isCalSlotSelected(dateStr, s))
    if (allSelected) {
        // deselect all
        if (calSelectedSlots.value[dateStr]) {
            calSelectedSlots.value[dateStr] = calSelectedSlots.value[dateStr].filter(
                sel => !availSlots.some(s => s.id === sel.slotId)
            )
        }
    } else {
        // select all available regular slots
        if (!calSelectedSlots.value[dateStr]) calSelectedSlots.value[dateStr] = []
        availSlots.forEach(s => {
            if (!isCalSlotSelected(dateStr, s)) {
                calSelectedSlots.value[dateStr].push({
                    slotId: s.id,
                    isPerPerson: false,
                    slot_data: s,
                    dateObj
                })
            }
        })
    }
}

async function saveCalendarSlots() {
    const dateEntries = Object.entries(calSelectedSlots.value)
    if (dateEntries.length === 0) {
        toast.add({ severity: 'warn', summary: 'Warning', detail: 'Pilih setidaknya satu slot', life: 3000 })
        return
    }
    let addedCount = 0
    for (const [dateStr, slots] of dateEntries) {
        for (const s of slots) {
            const dateVal = s.dateObj.date
            if (s.isPerPerson) {
                const pp = perPersonForm.value[`${dateStr}-${s.slotId}`]
                const jumlah = pp?.jumlah_orang || 1
                const priceInfo = await adminBookingService.getSlotPrice(form.value.bo_venue_id, s.slotId, dateVal)
                tempJoggingLines.value.push({
                    temp_id: Date.now() + Math.random(),
                    bo_slot_id: s.slotId,
                    tanggal: dateVal,
                    jumlah_orang: jumlah,
                    harga_per_orang: priceInfo.pricePerPerson,
                    price: priceInfo.pricePerPerson * jumlah,
                    slot_data: s.slot_data
                })
            } else {
                const priceInfo = await adminBookingService.getSlotPrice(form.value.bo_venue_id, s.slotId, dateVal)
                tempDataline.value.push({
                    temp_id: Date.now() + Math.random(),
                    bo_slot_id: s.slotId,
                    tanggal: dateVal,
                    price: priceInfo.price,
                    slot_data: s.slot_data
                })
            }
            addedCount++
        }
    }
    toast.add({ severity: 'success', summary: 'Success', detail: `${addedCount} slot berhasil ditambahkan`, life: 3000 })
    showLineDialog.value = false
    calSelectedSlots.value = {}
    perPersonForm.value = {}
}

// Reset calendar state saat dialog dibuka
function openAddLineDialog() {
    if (!form.value.bo_venue_id) {
        toast.add({ severity: 'warn', summary: 'Warning', detail: 'Please select venue first', life: 3000 })
        return
    }
    calMonth.value = new Date().getMonth()
    calYear.value = new Date().getFullYear()
    calSlotsByDate.value = {}
    calSelectedSlots.value = {}
    calSelectedDate.value = null
    calMtMode.value = false
    perPersonForm.value = {}
    generateCalDates(calMonth.value, calYear.value)
    showLineDialog.value = true
}
// ─── MAINTENANCE TOGGLE ──────────────────────────────────────────────────────
async function toggleMaintenanceSlot(dateStr, slot, dateObj) {
    const key = `${dateStr}-${slot.id}`
    if (calMtLoading.value === key) return
    calMtLoading.value = key

    try {
        const status = getCalSlotStatus(dateStr, slot)

        if (status === 'MT') {
            // Hapus booking MT yang ada
            const bookings = calSlotsByDate.value[dateStr]?.bookings || []
            const mtBooking = bookings.find(b => b.bo_slot_id === slot.id && b.status === 'MT')
            if (mtBooking?.bo_booking_id) {
                // Soft-delete bookingline MT ini
                await svcline.delete(mtBooking.id)
                toast.add({ severity: 'success', summary: 'Maintenance dilepas', detail: `${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`, life: 2000 })
            }
        } else if (!status || status === null) {
            // Buat booking header MT dulu (dummy user admin), lalu bookingline
            // Kita gunakan existing form venue
            const mtBookingResult = await svc.add({
                bo_venue_id: form.value.bo_venue_id,
                bo_user_id: form.value.bo_user_id || null,
                bookingdate: dateObj.date.toISOString(),
                created: new Date().toISOString(),
                grandtotal: 0,
                original_total: 0,
                discount_amount: 0,
                status: 'MT',
                isactive: true
            })
            if (mtBookingResult.error) throw new Error(mtBookingResult.error.message)
            const newBookingId = mtBookingResult.data[0].id

            const lineResult = await svcline.add({
                bo_booking_id: newBookingId,
                bo_slot_id: slot.id,
                bo_venue_id: form.value.bo_venue_id,
                tanggal: dateStr,
                price: 0,
                isactive: true
            })
            if (lineResult.error) throw new Error(lineResult.error.message)
            toast.add({ severity: 'warn', summary: 'Maintenance aktif', detail: `${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`, life: 2000 })
        } else {
            toast.add({ severity: 'warn', summary: 'Slot sudah terisi', detail: 'Hanya slot kosong yang bisa di-set maintenance', life: 2000 })
            return
        }

        // Refresh cache untuk tanggal ini
        delete calSlotsByDate.value[dateStr]
        if (calSelectedDate.value?.dateStr === dateStr) {
            await selectCalDate(calSelectedDate.value)
        }
    } catch (err) {
        console.error(err)
        toast.add({ severity: 'error', summary: 'Error', detail: err.message || 'Gagal ubah maintenance', life: 3000 })
    } finally {
        calMtLoading.value = null
    }
}
// ─────────────────────────────────────────────────────────────────────────────

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
        // Gunakan toLocalDateStr agar tidak timezone shift
        const dateStr = date instanceof Date ? toLocalDateStr(date) : String(date).slice(0, 10)

        // === TIRU CARA CUSTOMER: pakai supabase embedded filter ===
        // bo_bookingline — filter by bo_venue_id dan status via !inner join
        const [regularResult, joggingResult] = await Promise.all([
            supabase
                .from('bo_bookingline')
                .select('tanggal, bo_slot_id, bo_booking!inner(id, status, bo_venue_id)')
                .eq('bo_booking.bo_venue_id', venueId)
                .in('bo_booking.status', ['WP', 'CO', 'MT'])
                .eq('isactive', true),
            supabase
                .from('bo_bookingline_jogging')
                .select('tanggal, bo_slot_id, bo_booking!inner(id, status)')
                .eq('bo_venue_id', venueId)
                .in('bo_booking.status', ['WP', 'CO', 'MT'])
                .eq('isactive', true)
        ])

        // Helper: normalkan tanggal dari DB ke YYYY-MM-DD
        // DB menyimpan campuran: "2026-02-25T17:00:00", "2026-02-25T00:00:00", dll.
        // Gunakan date part (slice 0-10) yang merupakan tanggal lokal yang disimpan
        const normalizeDbDate = (tanggal) => {
            if (!tanggal) return null
            return String(tanggal).slice(0, 10)
        }

        const combined = []

        if (regularResult.data) {
            regularResult.data
                .filter(item => normalizeDbDate(item.tanggal) === dateStr)
                .forEach(item => combined.push({
                    bo_slot_id: item.bo_slot_id,
                    tanggal: item.tanggal,
                    status: item.bo_booking.status
                }))
        }

        if (joggingResult.data) {
            joggingResult.data
                .filter(item => normalizeDbDate(item.tanggal) === dateStr)
                .forEach(item => combined.push({
                    bo_slot_id: item.bo_slot_id,
                    tanggal: item.tanggal,
                    status: item.bo_booking.status,
                    _isJogging: true
                }))
        }

        existingBookings.value = combined

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
    const isMT = form.value.status === 'MT'

    // Validasi
    if(!form.value.bo_venue_id) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select venue', life: 3000})
        return
    }
    
    if(!isMT && !form.value.bo_user_id) {
        toast.add({severity:'warn', summary:'Warning', detail:'Please select user', life: 3000})
        return
    }
    
    if(!isMT && tempDataline.value.length === 0 && tempJoggingLines.value.length === 0 && !isupdating.value) {
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
            
            // Create payment (skip untuk MT)
            if (!isMT) {
                try {
                    await createPayment(newBookingId, form.value.bo_user_id, form.value.grandtotal)
                } catch(err) {
                    console.error('Payment creation failed:', err)
                    toast.add({severity:'warn',summary:'Warning',detail:'Booking created but payment creation failed', life: 3000})
                }
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

// ─── TICKET / QR CODE ───────────────────────────────────────────────────────

const openTicket = async (item) => {
    if (item.status !== 'CO') return
    isLoadingTicket.value = true
    showTicketDialog.value = true
    ticketData.value = null

    try {
        const res = await svcBooking.getBooking(item.id)
        if (res.data && res.data.length > 0) {
            ticketData.value = res.data[0]
        } else {
            toast.add({ severity: 'error', summary: 'Error', detail: 'Booking tidak ditemukan', life: 3000 })
            showTicketDialog.value = false
        }
    } catch (err) {
        console.error(err)
        toast.add({ severity: 'error', summary: 'Error', detail: 'Gagal memuat data tiket', life: 3000 })
        showTicketDialog.value = false
    } finally {
        isLoadingTicket.value = false
    }
}

const ticketQrValue = computed(() => {
    if (!ticketData.value) return ''
    return `${ticketBaseUrl.value}/bookinginfo/${ticketData.value.id}`
})

const groupTicketLinesByDate = (lines, joggingLines) => {
    const acc = {}
    if (lines) {
        lines.forEach(line => {
            const date = line.tanggal
            if (!acc[date]) acc[date] = []
            acc[date].push({ ...line, _type: 'regular' })
        })
    }
    if (joggingLines) {
        joggingLines.forEach(line => {
            const date = line.tanggal
            if (!acc[date]) acc[date] = []
            acc[date].push({ ...line, _type: 'jogging' })
        })
    }
    return Object.fromEntries(Object.entries(acc).sort(([a], [b]) => a.localeCompare(b)))
}

const onPrintTicket = () => {
    window.print()
}

// ────────────────────────────────────────────────────────────────────────────

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
                        <Button 
                            v-if="slotProps.data.status === 'CO'" 
                            icon="pi pi-ticket" 
                            @click="openTicket(slotProps.data)" 
                            severity="warning" 
                            variant="text" 
                            v-tooltip="'Lihat Tiket / QR'"
                        ></Button>
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
                        @click="openAddLineDialog" 
                        severity="primary" 
                        icon="pi pi-calendar" 
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
            <Dialog v-model:visible="showChargeDialog" modal appendTo="body" :header="isEditingCharge ? 'Edit Biaya Tambahan' : 'Tambah Biaya Tambahan'" :style="{ width: 'min(95vw, 28rem)' }" :pt="{ root: { style: 'z-index: 9999 !important' }, mask: { style: 'z-index: 9998 !important' } }">
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

            <Dialog 
                v-model:visible="showLineDialog" 
                modal 
                appendTo="body"
                header="Pilih Slot Booking" 
                :style="{ width: 'min(98vw, 600px)', maxHeight: '92vh' }"
                :pt="{ 
                    root: { style: 'z-index: 10001 !important' },
                    mask: { style: 'z-index: 10000 !important' },
                    content: { class: 'p-0 flex flex-col overflow-hidden', style: 'height: calc(92vh - 120px)' }
                }"
            >
                <div class="flex flex-col h-full overflow-hidden">
                    <!-- Month navigation -->
                    <div class="flex items-center justify-between px-4 py-2.5 bg-[#0A0E4F] text-white flex-shrink-0">
                        <div class="flex items-center gap-2">
                            <button 
                                @click="prevCalMonth"
                                class="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                            >
                                <i class="pi pi-chevron-left text-sm"></i>
                            </button>
                            <span class="font-bold text-sm min-w-[130px] text-center">{{ calMonths[calMonth] }} {{ calYear }}</span>
                            <button @click="nextCalMonth" class="p-1.5 rounded-lg hover:bg-white/10 transition-all">
                                <i class="pi pi-chevron-right text-sm"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Status legend -->
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 bg-gray-50 border-b text-xs font-medium text-gray-600 flex-shrink-0">
                        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded border-2 border-gray-300 inline-block"></span>Tersedia</span>
                        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-[#0A0E4F] inline-block"></span>Dipilih</span>
                        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-green-600 inline-block"></span>Ditambah</span>
                        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-red-500 inline-block"></span>Booked</span>
                        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-yellow-400 inline-block"></span>Pending</span>
                        <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-gray-500 inline-block"></span>Maintenance</span>
                    </div>

                    <!-- Date list: horizontal scroll -->
                    <div class="border-b bg-white flex-shrink-0 overflow-x-auto" style="-webkit-overflow-scrolling: touch;">
                        <div class="flex gap-1 p-2" style="min-width: max-content;">
                            <div v-if="calDates.length === 0" class="text-xs text-gray-400 px-3 py-2">Tidak ada tanggal</div>
                            <button
                                v-for="d in calDates"
                                :key="d.dateStr"
                                @click="selectCalDate(d)"
                                class="flex flex-col items-center px-2.5 py-1.5 rounded-xl transition-all text-center flex-shrink-0 relative"
                                style="min-width: 48px"
                                :class="calSelectedDate?.dateStr === d.dateStr
                                    ? 'bg-[#0A0E4F] text-white shadow'
                                    : d.dateStr < toLocalDateStr(new Date())
                                        ? 'text-gray-400 hover:bg-gray-100'
                                        : 'hover:bg-gray-100 text-gray-700'"
                            >
                                <div class="text-[9px] opacity-60 uppercase leading-none">{{ d.dayname }}</div>
                                <div class="text-xs font-bold leading-tight mt-0.5" :class="d.dateStr < toLocalDateStr(new Date()) && calSelectedDate?.dateStr !== d.dateStr ? 'line-through opacity-50' : ''">
                                    {{ d.date.getDate() }}
                                </div>
                                <!-- Dot indicator -->
                                <span 
                                    v-if="calSelectedSlots[d.dateStr]?.length"
                                    class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                                    :class="calSelectedDate?.dateStr === d.dateStr ? 'bg-yellow-400' : 'bg-purple-500'"
                                ></span>
                                <i v-else-if="calLoadingDate === d.dateStr" class="pi pi-spin pi-spinner text-[9px] opacity-50 mt-0.5"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Slot grid area: scrollable -->
                    <div class="flex-1 overflow-y-auto p-3">
                        <!-- Empty state -->
                        <div v-if="!calSelectedDate" class="flex items-center justify-center h-full text-gray-400">
                            <div class="text-center">
                                <i class="pi pi-calendar text-4xl mb-2 block opacity-40"></i>
                                <span class="text-sm">Pilih tanggal di atas</span>
                            </div>
                        </div>

                        <!-- Loading -->
                        <div v-else-if="calLoadingDate === calSelectedDate.dateStr" class="flex items-center justify-center h-40 text-gray-400">
                            <div class="text-center">
                                <i class="pi pi-spin pi-spinner text-3xl mb-2 block"></i>
                                <span class="text-sm">Memuat slot...</span>
                            </div>
                        </div>

                        <div v-else>
                            <!-- Date title -->
                            <div class="flex items-center gap-2 mb-2.5">
                                <i class="pi pi-calendar-plus text-purple-600 text-sm"></i>
                                <span class="font-bold text-[#0A0E4F] text-sm">
                                    {{ calSelectedDate.date.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) }}
                                </span>
                                <span v-if="calSelectedSlots[calSelectedDate.dateStr]?.length" class="ml-auto text-xs font-bold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                                    {{ calSelectedSlots[calSelectedDate.dateStr].length }} dipilih
                                </span>
                            </div>

                            <!-- No slots -->
                            <div v-if="getCalSlots(calSelectedDate.dateStr).length === 0" class="p-6 text-center text-gray-400 bg-gray-50 rounded-xl">
                                <i class="pi pi-clock text-3xl mb-2 block"></i>
                                <span class="text-sm">Tidak ada slot tersedia</span>
                            </div>

                            <template v-else>
                                <!-- All Day button -->
                                <div class="mb-2">
                                    <button
                                        @click="toggleAllDayCal(calSelectedDate.dateStr, calSelectedDate)"
                                        class="w-full flex items-center justify-between px-3 py-2 rounded-lg border-2 transition-all text-sm font-semibold"
                                        :class="isAllDayCalSelected(calSelectedDate.dateStr)
                                            ? 'bg-[#0A0E4F] text-white border-[#0A0E4F]'
                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-purple-400 hover:bg-purple-50'"
                                    >
                                        <span class="flex items-center gap-2">
                                            <i class="pi pi-check-square"></i>
                                            All Day — pilih semua slot reguler
                                        </span>
                                        <span class="text-xs opacity-70">
                                            {{ getCalSlots(calSelectedDate.dateStr).filter(s => !s.isPerPerson && !['WP','CO','MT','ADDED'].includes(getCalSlotStatus(calSelectedDate.dateStr, s))).length }} slot
                                        </span>
                                    </button>
                                </div>

                                <!-- Slot grid -->
                                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div
                                    v-for="slot in getCalSlots(calSelectedDate.dateStr)"
                                    :key="slot.id"
                                    @click="toggleCalSlot(calSelectedDate.dateStr, slot, calSelectedDate)"
                                    class="relative px-2 py-2 text-center rounded-xl cursor-pointer transition-all duration-200 select-none"
                                    :class="getCalSlotClass(calSelectedDate.dateStr, slot)"
                                >
                                    <!-- MT loading spinner -->
                                    <div v-if="calMtLoading === `${calSelectedDate.dateStr}-${slot.id}`" class="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
                                        <i class="pi pi-spin pi-spinner text-white"></i>
                                    </div>

                                    <!-- Checkmark -->
                                    <div v-if="isCalSlotSelected(calSelectedDate.dateStr, slot)" class="absolute top-1 right-1">
                                        <i class="pi pi-check-circle text-white text-xs"></i>
                                    </div>

                                    <!-- Time -->
                                    <div class="text-xs font-bold leading-tight">
                                        {{ formatTime(slot.start_time) }} s/d {{ formatTime(slot.end_time) }}
                                    </div>

                                    <!-- Sub-label -->
                                    <div class="text-[10px] mt-0.5 leading-tight">
                                        <template v-if="getCalSlotStatus(calSelectedDate.dateStr, slot) === 'MT'">
                                            <span class="opacity-90">🔧 Maintenance</span>
                                        </template>
                                        <template v-else-if="getCalSlotStatus(calSelectedDate.dateStr, slot) === 'CO'">
                                            <span class="opacity-80">✗ Booked</span>
                                        </template>
                                        <template v-else-if="getCalSlotStatus(calSelectedDate.dateStr, slot) === 'WP'">
                                            <span class="opacity-80">⏳ Pending</span>
                                        </template>
                                        <template v-else-if="getCalSlotStatus(calSelectedDate.dateStr, slot) === 'ADDED'">
                                            <span class="opacity-80">✓ Ditambah</span>
                                        </template>
                                        <template v-else>
                                            <span class="font-semibold opacity-90">
                                                {{ slot.isPerPerson ? `Rp ${formatCurrency(slot.pricePerPerson)}/org` : `Rp ${formatCurrency(slot.price)}` }}
                                            </span>
                                        </template>
                                    </div>
                                </div>
                            </div>

                            <!-- Per-person inputs -->
                            <div 
                                v-if="calSelectedSlots[calSelectedDate.dateStr]?.some(s => s.isPerPerson)"
                                class="mt-3 space-y-1.5"
                            >
                                <div class="text-sm font-bold text-gray-700">Jumlah Orang</div>
                                <div 
                                    v-for="s in calSelectedSlots[calSelectedDate.dateStr].filter(s => s.isPerPerson)"
                                    :key="s.slotId"
                                    class="flex items-center gap-3 p-2 bg-blue-50 rounded-lg"
                                >
                                    <span class="text-sm flex-1">
                                        {{ formatTime(s.slot_data.start_time) }} - {{ formatTime(s.slot_data.end_time) }}
                                        <span class="text-xs text-gray-500 ml-1">(Rp {{ formatCurrency(s.slot_data.pricePerPerson) }}/org)</span>
                                    </span>
                                    <div class="flex items-center gap-1.5">
                                        <button 
                                            @click.stop="perPersonForm[`${calSelectedDate.dateStr}-${s.slotId}`].jumlah_orang = Math.max(1, (perPersonForm[`${calSelectedDate.dateStr}-${s.slotId}`]?.jumlah_orang||1)-1)"
                                            class="w-6 h-6 bg-gray-200 rounded font-bold text-sm hover:bg-gray-300 transition-all"
                                        >-</button>
                                        <span class="w-7 text-center font-bold text-sm">{{ perPersonForm[`${calSelectedDate.dateStr}-${s.slotId}`]?.jumlah_orang || 1 }}</span>
                                        <button 
                                            @click.stop="perPersonForm[`${calSelectedDate.dateStr}-${s.slotId}`].jumlah_orang = Math.min(s.slot_data.capacity||99, (perPersonForm[`${calSelectedDate.dateStr}-${s.slotId}`]?.jumlah_orang||1)+1)"
                                            class="w-6 h-6 bg-gray-200 rounded font-bold text-sm hover:bg-gray-300 transition-all"
                                        >+</button>
                                    </div>
                                </div>
                            </div>
                            </template><!-- end v-else (slots exist) -->
                        </div>
                    </div>

                    <!-- Footer -->
                    <div class="border-t bg-gray-50 px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0">
                        <div class="text-sm">
                            <span v-if="calTotalSelected > 0" class="font-bold text-purple-700">
                                {{ calTotalSelected }} slot dipilih · <span class="text-green-700">Rp {{ formatCurrency(calTotalPrice) }}</span>
                            </span>
                            <span v-else class="text-gray-400 text-xs">Belum ada slot dipilih</span>
                        </div>
                        <div class="flex gap-2 shrink-0">
                            <Button label="Tutup" severity="secondary" variant="outlined" size="small" @click="showLineDialog = false" />
                            <Button 
                                label="Tambahkan" 
                                icon="pi pi-check"
                                size="small"
                                @click="saveCalendarSlots" 
                                :loading="isLineLoading" 
                                :disabled="calTotalSelected === 0"
                            />
                        </div>
                    </div>
                </div>
            </Dialog>
        </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════
         TICKET DIALOG — Lembar Booking + QR Code (Admin)
         ═══════════════════════════════════════════════════════ -->
    <Dialog 
        v-model:visible="showTicketDialog" 
        modal 
        appendTo="body"
        :header="ticketData ? `Tiket Booking — ${ticketData.skey || ticketData.id}` : 'Memuat Tiket...'"
        :style="{ width: 'min(98vw, 680px)' }"
        :pt="{ root: { style: 'z-index: 9999 !important' }, mask: { style: 'z-index: 9998 !important' }, content: { class: 'p-0' } }"
    >
        <!-- Loading state -->
        <div v-if="isLoadingTicket" class="flex flex-col items-center justify-center py-16 gap-4">
            <i class="pi pi-spin pi-spinner text-4xl text-purple-600"></i>
            <p class="text-gray-500 font-semibold">Memuat data tiket...</p>
        </div>

        <!-- Ticket content -->
        <div v-else-if="ticketData" id="admin-ticket-content">
            <!-- ── Header gradient ── -->
            <div class="bg-gradient-to-r from-[#0A0E4F] via-[#5B21B6] to-[#7C3AED] p-6 text-white relative overflow-hidden">
                <div class="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -mr-20 -mt-20 pointer-events-none"></div>
                <div class="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full -ml-16 -mb-16 pointer-events-none"></div>
                <div class="relative z-10 text-center">
                    <div class="inline-block px-5 py-1.5 bg-[#FFC107] text-[#0A0E4F] rounded-full text-xs font-bold uppercase mb-3 tracking-wide">
                        ✅ Booking Confirmed
                    </div>
                    <h2 class="text-2xl font-black uppercase mb-2">{{ ticketData.bo_venue?.name }}</h2>
                    <div class="flex items-center justify-center gap-3 flex-wrap">
                        <span class="font-mono font-bold text-lg tracking-wider"># {{ ticketData.skey || ticketData.id }}</span>
                        <span class="px-3 py-1 bg-green-500 rounded-full text-xs font-bold">LUNAS</span>
                    </div>
                </div>
            </div>

            <div class="p-5 space-y-4">
                <!-- ── Info Pemesan ── -->
                <div class="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
                    <h3 class="font-bold text-[#0A0E4F] text-sm uppercase tracking-wide flex items-center gap-2">
                        <i class="pi pi-user text-purple-600"></i> Info Pemesan
                    </h3>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                            <div class="text-gray-500 text-xs">Nama</div>
                            <div class="font-semibold text-gray-800">{{ ticketData.bo_user?.name || '-' }}</div>
                        </div>
                        <div>
                            <div class="text-gray-500 text-xs">Email</div>
                            <div class="font-semibold text-gray-800">{{ ticketData.bo_user?.email || '-' }}</div>
                        </div>
                        <div>
                            <div class="text-gray-500 text-xs">No. Telp</div>
                            <div class="font-semibold text-gray-800">{{ ticketData.bo_user?.phone || '-' }}</div>
                        </div>
                        <div v-if="ticketData.bo_user?.companyname">
                            <div class="text-gray-500 text-xs">Organisasi / Perusahaan</div>
                            <div class="font-semibold text-gray-800">{{ ticketData.bo_user.companyname }}</div>
                        </div>
                        <div>
                            <div class="text-gray-500 text-xs">Tanggal Booking</div>
                            <div class="font-semibold text-gray-800">{{ ticketData.bookingdate ? new Date(ticketData.bookingdate).toLocaleString('id-ID') : '-' }}</div>
                        </div>
                        <div>
                            <div class="text-gray-500 text-xs">Dibuat</div>
                            <div class="font-semibold text-gray-800">{{ ticketData.created ? new Date(ticketData.created).toLocaleString('id-ID') : '-' }}</div>
                        </div>
                    </div>
                </div>

                <!-- ── Detail Pesanan (per tanggal) ── -->
                <div class="border border-gray-200 rounded-xl overflow-hidden">
                    <div class="bg-[#0A0E4F] text-white px-4 py-2.5 flex items-center gap-2">
                        <i class="pi pi-calendar text-[#FFC107]"></i>
                        <span class="font-bold text-sm uppercase tracking-wide">Detail Pesanan</span>
                        <span class="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">{{ ticketData.bo_venue?.name }}</span>
                    </div>
                    <div class="divide-y divide-gray-100">
                        <div 
                            v-for="(lines, date) in groupTicketLinesByDate(ticketData.bo_bookingline, ticketData.bo_bookingline_jogging)"
                            :key="date"
                            class="p-4"
                        >
                            <!-- Date header -->
                            <div class="flex items-center gap-2 mb-3">
                                <div class="w-2 h-2 rounded-full bg-purple-500"></div>
                                <span class="font-bold text-[#0A0E4F] text-sm">
                                    {{ new Date(date).toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) }}
                                </span>
                            </div>
                            <!-- Slot badges -->
                            <div class="flex flex-wrap gap-2">
                                <div 
                                    v-for="line in lines" 
                                    :key="line.id || line.tanggal"
                                    class="px-3 py-2 rounded-lg border-2 text-sm font-semibold"
                                    :class="line._type === 'jogging' 
                                        ? 'border-green-400 bg-green-50 text-green-800' 
                                        : 'border-purple-400 bg-purple-50 text-purple-800'"
                                >
                                    <div class="flex items-center gap-1.5">
                                        <i class="pi pi-clock text-xs"></i>
                                        <span>{{ line.bo_slot?.start_time }} - {{ line.bo_slot?.end_time }}</span>
                                    </div>
                                    <div v-if="line._type === 'jogging'" class="text-xs mt-0.5 text-green-600 font-normal">
                                        👥 {{ line.jumlah_orang }} org × Rp {{ formatCurrency(line.harga_per_orang) }}
                                    </div>
                                    <div class="text-xs mt-0.5 font-bold">
                                        Rp {{ formatCurrency(line.price) }}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Empty state -->
                        <div v-if="!ticketData.bo_bookingline?.length && !ticketData.bo_bookingline_jogging?.length" class="p-8 text-center text-gray-400">
                            <i class="pi pi-inbox text-3xl mb-2"></i>
                            <p>Tidak ada booking line</p>
                        </div>
                    </div>
                </div>

                <!-- ── Referral / Diskon (jika ada) ── -->
                <div 
                    v-if="ticketData.discount_amount && ticketData.discount_amount > 0"
                    class="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4"
                >
                    <div class="flex items-center gap-2 mb-2">
                        <i class="pi pi-tag text-green-600"></i>
                        <span class="font-bold text-green-800 text-sm">Kode Referral / Diskon</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div v-if="ticketData.original_total" class="flex justify-between col-span-2 text-gray-600">
                            <span>Subtotal Asli</span>
                            <span class="line-through">Rp {{ formatCurrency(ticketData.original_total) }}</span>
                        </div>
                        <div class="flex justify-between col-span-2 font-bold text-green-700 pt-1 border-t border-green-200">
                            <span>Diskon</span>
                            <span>-Rp {{ formatCurrency(ticketData.discount_amount) }}</span>
                        </div>
                    </div>
                </div>

                <!-- ── Ringkasan Pembayaran ── -->
                <div class="bg-gradient-to-r from-[#5B21B6] to-[#7C3AED] rounded-xl px-5 py-4 text-white flex items-center justify-between">
                    <div>
                        <div class="text-purple-200 text-xs uppercase font-bold tracking-wide">Total Pembayaran</div>
                        <div class="text-3xl font-black mt-0.5">Rp {{ formatCurrency(ticketData.grandtotal) }}</div>
                    </div>
                    <div class="text-right text-xs text-purple-200 space-y-1">
                        <div v-if="ticketData.bo_payment?.[0]?.status" class="flex items-center gap-1.5 justify-end">
                            <i class="pi pi-check-circle text-green-300"></i>
                            <span>{{ ticketData.bo_payment[0].status === 'CO' ? 'Lunas' : ticketData.bo_payment[0].status }}</span>
                        </div>
                        <div v-if="ticketData.bo_payment?.[0]?.created">
                            {{ new Date(ticketData.bo_payment[0].created).toLocaleDateString('id-ID') }}
                        </div>
                    </div>
                </div>

                <!-- ── QR Code ── -->
                <div class="bg-gradient-to-br from-[#FFC107]/20 to-[#FFD54F]/20 border-2 border-[#FFC107] rounded-2xl p-6 text-center">
                    <div class="inline-block p-4 bg-white rounded-2xl shadow-xl mb-3">
                        <VueQrcode :value="ticketQrValue" :options="{ width: 200, margin: 1 }"></VueQrcode>
                    </div>
                    <div class="text-xs text-gray-500 font-mono break-all mb-2 px-2">{{ ticketQrValue }}</div>
                    <div class="flex items-center justify-center gap-2 text-[#0A0E4F] font-bold text-sm">
                        <i class="pi pi-qrcode text-lg"></i>
                        <span>Scan QR Code untuk verifikasi reservasi</span>
                    </div>
                </div>

                <!-- ── Payment history ── -->
                <div v-if="ticketData.bo_payment?.length" class="border border-gray-200 rounded-xl overflow-hidden">
                    <div class="bg-gray-100 px-4 py-2 flex items-center gap-2">
                        <i class="pi pi-credit-card text-gray-600"></i>
                        <span class="font-bold text-sm text-gray-700">Riwayat Pembayaran</span>
                    </div>
                    <div class="divide-y divide-gray-100 text-sm">
                        <div v-for="payment in ticketData.bo_payment" :key="payment.id" class="px-4 py-3 flex items-center justify-between">
                            <div class="text-gray-600">{{ payment.created ? new Date(payment.created).toLocaleString('id-ID') : '-' }}</div>
                            <Tag 
                                :value="payment.status === 'CO' ? 'Lunas' : payment.status" 
                                :severity="payment.status === 'CO' ? 'success' : 'warn'"
                            ></Tag>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Ticket dialog footer -->
        <template #footer>
            <div class="flex justify-between w-full">
                <Button label="Tutup" severity="secondary" variant="outlined" @click="showTicketDialog = false" />
                <Button label="Print / Download" icon="pi pi-print" severity="success" @click="onPrintTicket" />
            </div>
        </template>
    </Dialog>
</template>

<style>
@media print {
    body * { visibility: hidden !important; }
    #admin-ticket-content,
    #admin-ticket-content * { visibility: visible !important; }
    #admin-ticket-content {
        position: fixed !important;
        top: 0; left: 0;
        width: 100%;
        background: white !important;
    }
    .p-dialog-footer { display: none !important; }
}
@page { size: A4; margin: 10mm; }
</style>