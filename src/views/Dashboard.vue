<template>
    <div class="dashboard-root">
        <!-- Header -->
        <div class="dash-header">
            <div class="dash-header-left">
                <div class="dash-title-badge">ADMIN</div>
                <h1 class="dash-title">Dashboard</h1>
            </div>
            <div class="dash-header-right">
                <select v-model="selectedYear" @change="loadAll" class="dash-select">
                    <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
                </select>
            </div>
        </div>

        <!-- Summary Cards -->
        <div class="summary-grid">
            <div class="summary-card card-revenue">
                <div class="card-icon">💰</div>
                <div class="card-body">
                    <div class="card-label">Pendapatan Bulan Ini</div>
                    <div class="card-value">{{ formatCurrency(summary.revenue) }}</div>
                    <div class="card-sub">{{ summary.paidBookings }} booking lunas</div>
                </div>
            </div>
            <div class="summary-card card-booking">
                <div class="card-icon">📋</div>
                <div class="card-body">
                    <div class="card-label">Total Booking</div>
                    <div class="card-value">{{ summary.totalBookings }}</div>
                    <div class="card-sub">
                        <span class="badge-co">CO {{ summary.statusCount.CO || 0 }}</span>
                        <span class="badge-wp">WP {{ summary.statusCount.WP || 0 }}</span>
                        <span class="badge-cl">CL {{ summary.statusCount.CL || 0 }}</span>
                    </div>
                </div>
            </div>
            <div class="summary-card card-slots">
                <div class="card-icon">🏟️</div>
                <div class="card-body">
                    <div class="card-label">Total Slot Terisi</div>
                    <div class="card-value">{{ summary.totalLines }}</div>
                    <div class="card-sub">dari {{ summary.totalVenues }} venue aktif</div>
                </div>
            </div>
            <div class="summary-card card-avg">
                <div class="card-icon">📈</div>
                <div class="card-body">
                    <div class="card-label">Rata-rata per Booking</div>
                    <div class="card-value">{{ summary.totalBookings ? formatCurrency(summary.revenue / summary.paidBookings || 0) : 'Rp 0' }}</div>
                    <div class="card-sub">bulan {{ monthNames[now.getMonth()] }} {{ selectedYear }}</div>
                </div>
            </div>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
            <!-- Revenue Bar Chart -->
            <div class="chart-card chart-revenue-card">
                <div class="chart-card-header">
                    <h2 class="chart-title">Pendapatan Tahunan {{ selectedYear }}</h2>
                </div>
                <div class="chart-wrapper">
                    <canvas ref="revenueChartRef"></canvas>
                </div>
            </div>

            <!-- Booking Status Doughnut -->
            <div class="chart-card chart-donut-card">
                <div class="chart-card-header">
                    <h2 class="chart-title">Status Booking</h2>
                </div>
                <div class="chart-wrapper chart-wrapper-donut">
                    <canvas ref="statusChartRef"></canvas>
                </div>
                <div class="donut-legend">
                    <div class="legend-item" v-for="item in statusLegend" :key="item.label">
                        <span class="legend-dot" :style="{background: item.color}"></span>
                        <span class="legend-label">{{ item.label }}</span>
                        <span class="legend-val">{{ item.value }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Venue Calendar -->
        <div class="calendar-section">
            <div class="calendar-header">
                <div class="calendar-header-top">
                    <h2 class="calendar-title">Kalender Venue — {{ monthNames[calendarMonth] }} {{ calendarYear }}</h2>
                    <div class="calendar-selectors">
                        <select v-model="calendarYear" @change="onCalendarDateChange" class="dash-select">
                            <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
                        </select>
                        <select v-model="calendarMonth" @change="onCalendarDateChange" class="dash-select">
                            <option v-for="(m, i) in monthNames" :key="i" :value="i">{{ m }}</option>
                        </select>
                    </div>
                </div>
                <div class="calendar-legend">
                    <span class="cal-legend-item"><span class="cal-dot co"></span> CO (Confirmed)</span>
                    <span class="cal-legend-item"><span class="cal-dot wp"></span> WP (Waiting Payment)</span>
                    <span class="cal-legend-item"><span class="cal-dot mt"></span> MT (Maintenance)</span>
                    <span class="cal-legend-item"><span class="cal-dot empty"></span> Kosong</span>
                </div>
            </div>

            <div v-if="isLoading" class="loading-state">
                <div class="spinner"></div>
                <span>Memuat data...</span>
            </div>

            <div v-else-if="venues.length === 0" class="empty-state">
                Tidak ada venue ditemukan.
            </div>

            <div v-else class="venue-tabs">
                <div class="venue-tab-buttons">
                    <button
                        v-for="venue in venues"
                        :key="venue.id"
                        :class="['venue-tab-btn', selectedVenueId === venue.id ? 'active' : '']"
                        @click="selectedVenueId = venue.id"
                    >
                        {{ venue.name }}
                    </button>
                </div>

                <div class="calendar-grid-wrapper" v-if="selectedVenue">
                    <div class="calendar-grid" :style="`--days: ${calendarDays.length}`">
                        <!-- Header: slot names -->
                        <div class="cal-corner">Slot / Tanggal</div>
                        <div
                            v-for="day in calendarDays"
                            :key="day.dateStr"
                            class="cal-date-header"
                            :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
                        >
                            <span class="cal-dayname">{{ day.dayName }}</span>
                            <span class="cal-daynum">{{ day.dayNum }}</span>
                        </div>

                        <!-- Rows per slot -->
                        <template v-for="slot in venueSlots" :key="slot.id">
                            <div class="cal-slot-label">
                                <div class="slot-name">{{ slot.name }}</div>
                                <div class="slot-time">{{ slot.start_time?.slice(0,5) }} – {{ slot.end_time?.slice(0,5) }}</div>
                            </div>
                            <div
                                v-for="day in calendarDays"
                                :key="day.dateStr"
                                class="cal-cell"
                                :class="getCellClass(slot.id, day.dateStr)"
                                :title="getCellTooltip(slot.id, day.dateStr)"
                            >
                                <span class="cell-status-icon">{{ getCellIcon(slot.id, day.dateStr) }}</span>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import RestService from '../services/rest'
import { supabase } from '../plugins/supabaseClient'
import { formatCurrency } from '../composables/formater'
import Chart from 'chart.js/auto'

// ── Services ────────────────────────────────────────────────
const svcBooking     = new RestService('bo_booking')
const svcVenue       = new RestService('bo_venue')

// ── State ────────────────────────────────────────────────────
const isLoading      = ref(false)
const venues         = ref([])
const selectedVenueId = ref(null)
const venueSlots     = ref([])
const calendarBookings = ref([]) // bookinglines for selected venue+month

// Charts refs
const revenueChartRef = ref(null)
const statusChartRef  = ref(null)
let revenueChartInstance = null
let statusChartInstance  = null

// ── Date State ────────────────────────────────────────────────
const now = new Date()
// selectedYear: untuk summary cards + chart (filter tahun saja)
const selectedYear   = ref(now.getFullYear())

// calendarMonth + calendarYear: khusus untuk kalender venue
const calendarMonth  = ref(now.getMonth())
const calendarYear   = ref(now.getFullYear())
const yearOptions   = computed(() => {
    const base = now.getFullYear()
    return [base - 1, base, base + 1]
})
const monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

// ── Summary State ─────────────────────────────────────────────
const summary = ref({
    revenue: 0,
    paidBookings: 0,
    totalBookings: 0,
    totalLines: 0,
    totalVenues: 0,
    statusCount: {}
})

// ── 6-month revenue data ──────────────────────────────────────
const sixMonthRevenue = ref([]) // [{label, revenue}]

// ── Status legend ─────────────────────────────────────────────
const statusLegend = computed(() => [
    { label: 'Confirmed (CO)',        color: '#10b981', value: summary.value.statusCount.CO || 0 },
    { label: 'Waiting Payment (WP)', color: '#f59e0b', value: summary.value.statusCount.WP || 0 },
    { label: 'Maintenance (MT)',      color: '#6366f1', value: summary.value.statusCount.MT || 0 },
    { label: 'Cancelled (CL)',        color: '#f43f5e', value: summary.value.statusCount.CL || 0 },
])

// ── Selected Venue Object ─────────────────────────────────────
const selectedVenue = computed(() => venues.value.find(v => v.id === selectedVenueId.value))

// ── Calendar Days ─────────────────────────────────────────────
const calendarDays = computed(() => {
    const year  = calendarYear.value
    const month = calendarMonth.value
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const todayStr = toLocalDateStr(now)
    const days = []
    const dayShort = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d)
        const dateStr = toLocalDateStr(dateObj)
        days.push({
            dateStr,
            dayNum: d,
            dayName: dayShort[dateObj.getDay()],
            isToday: dateStr === todayStr,
            isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6
        })
    }
    return days
})

// ── Helpers ───────────────────────────────────────────────────
function toLocalDateStr(date) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2,'0')
    const d = String(date.getDate()).padStart(2,'0')
    return `${y}-${m}-${d}`
}

function getMonthRange(year, month) {
    const start = `${year}-${String(month+1).padStart(2,'0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const end = `${year}-${String(month+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    return { start, end }
}

// ── Cell helpers ──────────────────────────────────────────────
// bookingMap: { slotId-dateStr: [{status}] } - filter by selected month
const bookingMap = computed(() => {
    const map = {}
    const { start, end } = getMonthRange(calendarYear.value, calendarMonth.value)
    for (const line of calendarBookings.value) {
        const dateStr = (line.tanggal || line.bookingdate || '').slice(0,10)
        if (!dateStr || dateStr < start || dateStr > end) continue
        // Skip status CL (cancelled) agar tidak muncul di kalender
        if (line.status === 'CL') continue
        const key = `${line.bo_slot_id}-${dateStr}`
        if (!map[key]) map[key] = []
        map[key].push(line)
    }
    return map
})

function getCellStatus(slotId, dateStr) {
    const entries = bookingMap.value[`${slotId}-${dateStr}`]
    if (!entries || entries.length === 0) return null
    // Prioritas: CO > WP > MT > CL
    const priority = ['CO','MT','WP','CL']
    for (const p of priority) {
        if (entries.some(e => e.status === p)) return p
    }
    return entries[0].status
}

function getCellClass(slotId, dateStr) {
    const status = getCellStatus(slotId, dateStr)
    if (!status) return 'cell-empty'
    if (status === 'CO') return 'cell-co'
    if (status === 'WP') return 'cell-wp'
    if (status === 'MT') return 'cell-mt'
    if (status === 'CL') return 'cell-cl'
    return 'cell-empty'
}

function getCellIcon(slotId, dateStr) {
    const status = getCellStatus(slotId, dateStr)
    if (!status) return ''
    if (status === 'CO') return '✓'
    if (status === 'WP') return '⏳'
    if (status === 'MT') return '🔧'
    if (status === 'CL') return '✕'
    return ''
}

function getCellTooltip(slotId, dateStr) {
    const entries = bookingMap.value[`${slotId}-${dateStr}`]
    if (!entries || entries.length === 0) return 'Kosong'
    return entries.map(e => `${e.status}`).join(', ')
}

// ── Load Functions ────────────────────────────────────────────
async function loadVenues() {
    const res = await svcVenue.list(0, 100, [{ col: 'seqno', asc: true }])
    venues.value = res.data || []
    if (venues.value.length > 0 && !selectedVenueId.value) {
        selectedVenueId.value = venues.value[0].id
    }
}

async function loadSlotsForVenue(venueId) {
    const { data: prices } = await supabase
        .from('bo_price')
        .select('bo_slot_id, bo_slot(id, name, start_time, end_time)')
        .eq('bo_venue_id', venueId)
        .eq('isactive', true)
    const uniqueSlots = {}
    ;(prices || []).forEach(price => {
        const slotId = price.bo_slot_id
        if (!uniqueSlots[slotId] && price.bo_slot) {
            uniqueSlots[slotId] = {
                id: price.bo_slot.id,
                name: price.bo_slot.name,
                start_time: price.bo_slot.start_time,
                end_time: price.bo_slot.end_time,
            }
        }
    })
    venueSlots.value = Object.values(uniqueSlots).sort((a,b) => a.start_time > b.start_time ? 1 : -1)
}

async function loadCalendarBookings(venueId) {
    // RPC untuk bo_bookingline
    const { data: rpcData } = await supabase.rpc('getBookingSchedules', { venue_id: venueId })

    // Query langsung untuk bo_bookingline_jogging
    const { data: joggingData } = await supabase
        .from('bo_bookingline_jogging')
        .select('tanggal, bo_slot_id, bo_booking!inner(status)')
        .eq('bo_venue_id', venueId)
        .eq('isactive', true)

    const joggingTransformed = (joggingData || []).map(item => ({
        tanggal: item.tanggal,
        bo_slot_id: item.bo_slot_id,
        status: item.bo_booking.status,
    }))

    calendarBookings.value = [...(rpcData || []), ...joggingTransformed]
}

async function loadSummary() {
    // Summary menggunakan bulan berjalan + tahun yang dipilih di header atas
    const { start, end } = getMonthRange(selectedYear.value, now.getMonth())

    const res = await svcBooking.listwhere(0, 2000, [
        { field: 'bookingdate', op: 'gte', value: start },
        { field: 'bookingdate', op: 'lte', value: end },
        { field: 'isactive', op: 'eq', value: true }
    ])
    const bookings = res.data || []

    const statusCount = {}
    let revenue = 0
    let paidBookings = 0

    bookings.forEach(b => {
        statusCount[b.status] = (statusCount[b.status] || 0) + 1
        if (b.status === 'CO') {
            revenue += b.grandtotal || 0
            paidBookings++
        }
    })

    // Hitung total lines bulan ini
    let totalLines = 0
    try {
        const [{ data: lineData }, { data: joggingData }] = await Promise.all([
            supabase
                .from('bo_bookingline')
                .select('id, bo_booking!inner(status)')
                .gte('tanggal', start)
                .lte('tanggal', end)
                .eq('isactive', true),
            supabase
                .from('bo_bookingline_jogging')
                .select('id, bo_booking!inner(status)')
                .gte('tanggal', start)
                .lte('tanggal', end)
                .eq('isactive', true)
        ])
        const all = [...(lineData || []), ...(joggingData || [])]
        totalLines = all.filter(l => l.bo_booking?.status !== 'CL').length
    } catch(e) {
        console.warn('totalLines error:', e)
    }

    summary.value = {
        revenue,
        paidBookings,
        totalBookings: bookings.length,
        totalLines,
        totalVenues: venues.value.length,
        statusCount
    }
}

async function load6MonthRevenue() {
    // Fetch semua booking CO untuk tahun yang dipilih (selectedYear)
    const y = selectedYear.value
    const { data: bookings } = await supabase
        .from('bo_booking')
        .select('bookingdate, grandtotal')
        .gte('bookingdate', `${y}-01-01`)
        .lte('bookingdate', `${y}-12-31`)
        .eq('status', 'CO')
        .eq('isactive', true)

    // Group by bulan
    const revenueByMonth = Array(12).fill(0)
    ;(bookings || []).forEach(b => {
        const m = new Date(b.bookingdate).getMonth()
        revenueByMonth[m] += b.grandtotal || 0
    })

    sixMonthRevenue.value = monthNames.map((name, i) => ({
        label: name.slice(0, 3),
        revenue: revenueByMonth[i]
    }))
}

// ── Chart rendering ───────────────────────────────────────────
function renderRevenueChart() {
    if (!revenueChartRef.value) return
    if (revenueChartInstance) revenueChartInstance.destroy()

    const labels = sixMonthRevenue.value.map(d => d.label)
    const data   = sixMonthRevenue.value.map(d => d.revenue)
    const curMonth = now.getMonth() // highlight bulan berjalan

    revenueChartInstance = new Chart(revenueChartRef.value, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Pendapatan (Rp)',
                data,
                backgroundColor: data.map((v, i) =>
                    i === curMonth
                        ? 'rgba(99, 102, 241, 0.95)'
                        : 'rgba(99, 102, 241, 0.38)'
                ),
                borderColor: 'rgba(99, 102, 241, 0.7)',
                borderWidth: 1.5,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ' Rp ' + ctx.raw.toLocaleString('id-ID')
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        callback: (v) => 'Rp ' + (v >= 1_000_000 ? (v/1_000_000).toFixed(0)+'jt' : v.toLocaleString('id-ID')),
                        font: { size: 11 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    })
}

function renderStatusChart() {
    if (!statusChartRef.value) return
    if (statusChartInstance) statusChartInstance.destroy()

    const counts = summary.value.statusCount
    const labels = ['CO', 'WP', 'MT', 'CL']
    const data   = labels.map(l => counts[l] || 0)
    const total  = data.reduce((a,b)=>a+b,0)
    if (total === 0) return

    statusChartInstance = new Chart(statusChartRef.value, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#10b981','#f59e0b','#6366f1','#f43f5e'],
                borderWidth: 2,
                borderColor: '#fff',
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${ctx.raw} booking`
                    }
                }
            }
        }
    })
}

// ── Load All ──────────────────────────────────────────────────
async function loadAll() {
    isLoading.value = true
    try {
        await Promise.all([loadSummary(), load6MonthRevenue()])
        await nextTick()
        renderRevenueChart()
        renderStatusChart()
    } finally {
        isLoading.value = false
    }
}

// ── Watch venue tab change ────────────────────────────────────
watch(selectedVenueId, async (id) => {
    if (!id) return
    isLoading.value = true
    try {
        await Promise.all([loadSlotsForVenue(id), loadCalendarBookings(id)])
    } finally {
        isLoading.value = false
    }
})

// ── Mount ─────────────────────────────────────────────────────
onMounted(async () => {
    await loadVenues()
    await loadAll()
    if (selectedVenueId.value) {
        await loadSlotsForVenue(selectedVenueId.value)
        await loadCalendarBookings(selectedVenueId.value)
    }
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

.dashboard-root {
    font-family: 'Plus Jakarta Sans', sans-serif;
    padding: 1.5rem;
    background: #f4f5f7;
    min-height: 100vh;
    color: #1a1d23;
}

/* ── Header ── */
.dash-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.75rem;
    flex-wrap: wrap;
    gap: 0.75rem;
}
.dash-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}
.dash-title-badge {
    background: #6366f1;
    color: #fff;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
}
.dash-title {
    font-size: 1.6rem;
    font-weight: 800;
    margin: 0;
    letter-spacing: -0.02em;
}
.dash-header-right {
    display: flex;
    gap: 0.5rem;
}
.dash-select {
    background: #fff;
    border: 1.5px solid #e0e2e8;
    border-radius: 8px;
    padding: 0.45rem 0.85rem;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.875rem;
    font-weight: 600;
    color: #1a1d23;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
}
.dash-select:focus { border-color: #6366f1; }

/* ── Summary Cards ── */
.summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
}
.summary-card {
    background: #fff;
    border-radius: 14px;
    padding: 1.25rem 1.35rem;
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    border: 1.5px solid transparent;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    transition: transform 0.15s, box-shadow 0.15s;
}
.summary-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0,0,0,0.09);
}
.card-revenue { border-color: #d1fae5; background: linear-gradient(135deg, #fff 60%, #f0fdf4); }
.card-booking { border-color: #e0e7ff; background: linear-gradient(135deg, #fff 60%, #eef2ff); }
.card-slots   { border-color: #fce7f3; background: linear-gradient(135deg, #fff 60%, #fdf2f8); }
.card-avg     { border-color: #fef3c7; background: linear-gradient(135deg, #fff 60%, #fffbeb); }

.card-icon {
    font-size: 1.75rem;
    line-height: 1;
    flex-shrink: 0;
}
.card-body { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.card-label { font-size: 0.75rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
.card-value { font-size: 1.45rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; letter-spacing: -0.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-sub { font-size: 0.78rem; color: #9ca3af; display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.1rem; }

.badge-co { background: #dcfce7; color: #16a34a; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem; }
.badge-wp { background: #fef9c3; color: #ca8a04; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem; }
.badge-cl { background: #fee2e2; color: #dc2626; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem; }

/* ── Charts Row ── */
.charts-row {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: 1rem;
    margin-bottom: 1.5rem;
}
@media (max-width: 900px) {
    .charts-row { grid-template-columns: 1fr; }
}
.chart-card {
    background: #fff;
    border-radius: 14px;
    padding: 1.35rem;
    border: 1.5px solid #e9eaf0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.chart-card-header { margin-bottom: 1rem; }
.chart-title { font-size: 0.95rem; font-weight: 700; margin: 0; }
.chart-wrapper { position: relative; height: 220px; }
.chart-wrapper-donut { height: 170px; }

.donut-legend { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem; }
.legend-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.legend-label { flex: 1; color: #4b5563; }
.legend-val { font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }

/* ── Venue Calendar ── */
.calendar-section {
    background: #fff;
    border-radius: 14px;
    padding: 1.35rem;
    border: 1.5px solid #e9eaf0;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}
.calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
}
.calendar-title { font-size: 0.95rem; font-weight: 700; margin: 0; }
.calendar-legend { display: flex; gap: 0.85rem; flex-wrap: wrap; }
.cal-legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; color: #6b7280; font-weight: 600; }
.cal-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.cal-dot.co    { background: #10b981; }
.cal-dot.wp    { background: #f59e0b; }
.cal-dot.mt    { background: #6366f1; }
.cal-dot.empty { background: #e5e7eb; border: 1px solid #d1d5db; }

/* Venue Tabs */
.venue-tabs { display: flex; flex-direction: column; gap: 1rem; }
.venue-tab-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
}
.venue-tab-btn {
    padding: 0.4rem 1rem;
    border-radius: 8px;
    border: 1.5px solid #e5e7eb;
    background: #f9fafb;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    color: #4b5563;
    transition: all 0.15s;
}
.venue-tab-btn:hover { border-color: #6366f1; color: #6366f1; }
.venue-tab-btn.active { background: #6366f1; border-color: #6366f1; color: #fff; }

/* Calendar Grid */
.calendar-grid-wrapper {
    overflow-x: auto;
    border-radius: 10px;
    border: 1px solid #e5e7eb;
}
.calendar-grid {
    display: grid;
    grid-template-columns: 130px repeat(var(--days, 31), minmax(36px, 1fr));
    min-width: max-content;
    width: 100%;
}

.cal-corner {
    background: #f8fafc;
    border-bottom: 2px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    padding: 0.5rem 0.75rem;
    font-size: 0.72rem;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    position: sticky;
    left: 0;
    z-index: 2;
}

.cal-date-header {
    background: #f8fafc;
    border-bottom: 2px solid #e5e7eb;
    border-right: 1px solid #f0f0f0;
    padding: 0.4rem 0.25rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 36px;
}
.cal-date-header.is-today {
    background: #eef2ff;
}
.cal-date-header.is-weekend .cal-dayname { color: #f43f5e; }
.cal-dayname { font-size: 0.6rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; }
.cal-daynum  { font-size: 0.78rem; font-weight: 700; color: #374151; line-height: 1.3; }
.cal-date-header.is-today .cal-daynum { color: #6366f1; }

.cal-slot-label {
    background: #fafafa;
    border-bottom: 1px solid #f0f0f0;
    border-right: 1px solid #e5e7eb;
    padding: 0.45rem 0.75rem;
    position: sticky;
    left: 0;
    z-index: 1;
}
.slot-name { font-size: 0.78rem; font-weight: 700; color: #374151; }
.slot-time { font-size: 0.68rem; color: #9ca3af; font-family: 'JetBrains Mono', monospace; }

.cal-cell {
    border-bottom: 1px solid #f0f0f0;
    border-right: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    font-size: 0.72rem;
    font-weight: 700;
    cursor: default;
    transition: filter 0.1s;
}
.cal-cell:hover { filter: brightness(0.93); }

.cell-empty { background: #fff; color: transparent; }
.cell-co    { background: #d1fae5; color: #059669; }
.cell-wp    { background: #fef3c7; color: #d97706; }
.cell-mt    { background: #e0e7ff; color: #4338ca; }
.cell-cl    { background: #fee2e2; color: #dc2626; }

.cell-status-icon { font-size: 0.7rem; }

/* Loading/Empty */
.loading-state, .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem;
    color: #9ca3af;
    font-size: 0.9rem;
}
.spinner {
    width: 20px; height: 20px;
    border: 2px solid #e5e7eb;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>