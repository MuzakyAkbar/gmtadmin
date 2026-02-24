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
                        <span class="badge-mt">MT {{ summary.statusCount.MT || 0 }}</span>
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
                    <h2 class="calendar-title">Calendar Booking</h2>
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

            <div v-else>
                <!-- Venue tabs -->
                <div class="venue-tab-buttons" style="margin-bottom:0.75rem">
                    <button
                        v-for="venue in venues"
                        :key="venue.id"
                        :class="['venue-tab-btn', selectedVenueId === venue.id ? 'active' : '']"
                        @click="selectedVenueId = venue.id"
                    >{{ venue.name }}</button>
                </div>

                <!-- Time-grid calendar toolbar -->
                <div class="tg-toolbar">
                    <div class="tg-toolbar-left">
                        <button class="tg-btn" @click="goToToday">Today</button>
                        <button class="tg-btn tg-nav" @click="prevPeriod">‹</button>
                        <button class="tg-btn tg-nav" @click="nextPeriod">›</button>
                        <span class="tg-range-label">{{ weekRangeLabel }}</span>
                    </div>
                    <div class="tg-toolbar-right">
                        <button :class="['tg-btn', calView==='day'?'tg-btn-active':'']" @click="setCalView('day')">Day</button>
                        <button :class="['tg-btn', calView==='week'?'tg-btn-active':'']" @click="setCalView('week')">Week</button>
                        <button :class="['tg-btn', calView==='month'?'tg-btn-active':'']" @click="setCalView('month')">Month</button>
                    </div>
                </div>

                <!-- ── MONTH VIEW ── -->
                <div class="tg-month-wrapper" v-if="selectedVenue && calView==='month'">
                    <!-- Day-of-week header -->
                    <div class="tg-month-head">
                        <div v-for="d in ['Min','Sen','Sel','Rab','Kam','Jum','Sab']" :key="d" class="tg-month-headcell">{{ d }}</div>
                    </div>
                    <!-- Weeks grid -->
                    <div class="tg-month-grid">
                        <div
                            v-for="cell in monthCells"
                            :key="cell.dateStr"
                            class="tg-month-cell"
                            :class="{
                                'tg-month-cell-other': !cell.inMonth,
                                'tg-month-cell-today': cell.isToday,
                                'tg-month-cell-weekend': cell.isWeekend
                            }"
                        >
                            <div class="tg-month-daynum">{{ cell.dayNum }}</div>
                            <div class="tg-month-events">
                                <template v-for="slot in venueSlots" :key="slot.id">
                                    <div
                                        v-if="getCellStatus(slot.id, cell.dateStr)"
                                        class="tg-month-chip"
                                        :class="'tg-event-' + getCellStatus(slot.id, cell.dateStr)?.toLowerCase()"
                                        @click="openCellDetail(slot.id, cell.dateStr)"
                                    >
                                        <span class="tg-month-chip-name">{{ slot.start_time?.slice(0,5) }} – {{ slot.end_time?.slice(0,5) }}</span>
                                        <span class="tg-month-chip-customer">
                                            {{ getCellCustomerName(slot.id, cell.dateStr) || slot.name }}
                                        </span>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ── DAY / WEEK TIME-GRID VIEW ── -->
                <div class="tg-wrapper" v-else-if="selectedVenue">
                    <!-- Day headers -->
                    <div class="tg-header-row">
                        <div class="tg-time-gutter"></div>
                        <div
                            v-for="day in viewDays"
                            :key="day.dateStr"
                            class="tg-day-header"
                            :class="{ 'tg-today': day.isToday, 'tg-weekend': day.isWeekend }"
                        >
                            <span class="tg-dayname">{{ day.dayName }}</span>
                            <span class="tg-daynum">{{ day.dayNum }}</span>
                        </div>
                    </div>

                    <!-- Scrollable time grid body -->
                    <div class="tg-body-scroll" ref="tgBodyRef">
                        <div class="tg-body">
                            <!-- Hour rows -->
                            <div v-for="hour in hours" :key="hour" class="tg-hour-row">
                                <div class="tg-time-label">{{ String(hour).padStart(2,'0') }}:00</div>
                                <div
                                    v-for="day in viewDays"
                                    :key="day.dateStr"
                                    class="tg-hour-cell"
                                    :class="{ 'tg-today-col': day.isToday }"
                                ></div>
                            </div>

                            <!-- Events overlay per day column -->
                            <div class="tg-events-layer">
                                <div class="tg-events-gutter"></div>
                                <div
                                    v-for="day in viewDays"
                                    :key="day.dateStr"
                                    class="tg-events-col"
                                >
                                    <template v-for="slot in venueSlots" :key="slot.id">
                                        <div
                                            v-if="getSlotEventStyle(slot, day.dateStr)"
                                            class="tg-event"
                                            :class="getTgEventClass(slot.id, day.dateStr)"
                                            :style="getSlotEventStyle(slot, day.dateStr)"
                                            @click="openCellDetail(slot.id, day.dateStr)"
                                        >
                                            <div class="tg-event-title">{{ slot.name }}</div>
                                            <div class="tg-event-time">{{ slot.start_time?.slice(0,5) }} – {{ slot.end_time?.slice(0,5) }}</div>
                                            <div class="tg-event-customer" v-if="getCellCustomerName(slot.id, day.dateStr)">
                                                👤 {{ getCellCustomerName(slot.id, day.dateStr) }}
                                            </div>
                                            <div class="tg-event-venue">{{ selectedVenue?.name }}</div>
                                        </div>
                                    </template>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Cell Detail Modal -->
    <transition name="modal-fade">
        <div v-if="cellDetail.show" class="modal-overlay" @click.self="cellDetail.show = false">
            <div class="modal-card">
                <div class="modal-header">
                    <div class="modal-title-group">
                        <span class="modal-status-badge" :class="`mbadge-${cellDetail.status?.toLowerCase()}`">
                            {{ cellDetail.status }}
                        </span>
                        <h3 class="modal-title">{{ cellDetail.slotName }}</h3>
                    </div>
                    <button class="modal-close" @click="cellDetail.show = false">✕</button>
                </div>
                <div class="modal-date-info">
                    <span class="modal-date-icon">📅</span>
                    <span>{{ cellDetail.dateLabel }}</span>
                </div>

                <!-- CO Detail -->
                <div v-if="cellDetail.status === 'CO'" class="modal-body">
                    <div v-for="entry in cellDetail.entries" :key="entry.bo_booking_id" class="detail-entry">
                        <div class="detail-row">
                            <span class="detail-icon">🎫</span>
                            <span class="detail-label">ID Booking</span>
                            <span class="detail-value detail-mono" style="font-size:0.7rem">{{ entry.bo_booking_id || '-' }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-icon">👤</span>
                            <span class="detail-label">Customer</span>
                            <span class="detail-value">{{ entry.customer_name || '-' }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_phone">
                            <span class="detail-icon">📱</span>
                            <span class="detail-label">Telepon</span>
                            <span class="detail-value detail-mono">{{ entry.customer_phone }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_email">
                            <span class="detail-icon">✉️</span>
                            <span class="detail-label">Email</span>
                            <span class="detail-value">{{ entry.customer_email }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_company">
                            <span class="detail-icon">🏢</span>
                            <span class="detail-label">Perusahaan</span>
                            <span class="detail-value">{{ entry.customer_company }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.price">
                            <span class="detail-icon">🎟️</span>
                            <span class="detail-label">Harga Slot</span>
                            <span class="detail-value detail-green">{{ formatCurrency(entry.price) }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.grandtotal">
                            <span class="detail-icon">💰</span>
                            <span class="detail-label">Total Booking</span>
                            <span class="detail-value detail-green" style="font-weight:800">{{ formatCurrency(entry.grandtotal) }}</span>
                        </div>
                        <div v-if="cellDetail.entries.length > 1" class="detail-divider"></div>
                    </div>
                </div>

                <!-- MT Detail -->
                <div v-else-if="cellDetail.status === 'MT'" class="modal-body">
                    <div class="mt-banner">
                        <span class="mt-icon">🔧</span>
                        <div>
                            <div class="mt-title">Jadwal Maintenance</div>
                            <div class="mt-sub">Slot tidak tersedia untuk booking</div>
                        </div>
                    </div>
                    <div v-for="entry in cellDetail.entries" :key="entry.bo_booking_id" class="detail-entry">
                        <div class="detail-row" v-if="entry.bo_booking_id">
                            <span class="detail-icon">🎫</span>
                            <span class="detail-label">ID Booking</span>
                            <span class="detail-value detail-mono" style="font-size:0.7rem">{{ entry.bo_booking_id }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_name">
                            <span class="detail-icon">👤</span>
                            <span class="detail-label">PIC</span>
                            <span class="detail-value">{{ entry.customer_name }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_phone">
                            <span class="detail-icon">📱</span>
                            <span class="detail-label">Telepon</span>
                            <span class="detail-value detail-mono">{{ entry.customer_phone }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.notes">
                            <span class="detail-icon">📝</span>
                            <span class="detail-label">Keterangan</span>
                            <span class="detail-value">{{ entry.notes }}</span>
                        </div>
                    </div>
                </div>

                <!-- WP Detail -->
                <div v-else-if="cellDetail.status === 'WP'" class="modal-body">
                    <div v-for="entry in cellDetail.entries" :key="entry.bo_booking_id" class="detail-entry">
                        <div class="detail-row">
                            <span class="detail-icon">⏳</span>
                            <span class="detail-label">Status</span>
                            <span class="detail-value" style="color:#d97706;font-weight:700">Menunggu Pembayaran</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-icon">🎫</span>
                            <span class="detail-label">ID Booking</span>
                            <span class="detail-value detail-mono" style="font-size:0.7rem">{{ entry.bo_booking_id || '-' }}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-icon">👤</span>
                            <span class="detail-label">Customer</span>
                            <span class="detail-value">{{ entry.customer_name || '-' }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_phone">
                            <span class="detail-icon">📱</span>
                            <span class="detail-label">Telepon</span>
                            <span class="detail-value detail-mono">{{ entry.customer_phone }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_email">
                            <span class="detail-icon">✉️</span>
                            <span class="detail-label">Email</span>
                            <span class="detail-value">{{ entry.customer_email }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.customer_company">
                            <span class="detail-icon">🏢</span>
                            <span class="detail-label">Perusahaan</span>
                            <span class="detail-value">{{ entry.customer_company }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.price">
                            <span class="detail-icon">🎟️</span>
                            <span class="detail-label">Harga Slot</span>
                            <span class="detail-value">{{ formatCurrency(entry.price) }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.jumlah_orang">
                            <span class="detail-icon">👥</span>
                            <span class="detail-label">Jumlah Orang</span>
                            <span class="detail-value">{{ entry.jumlah_orang }} orang × {{ formatCurrency(entry.harga_per_orang) }}</span>
                        </div>
                        <div class="detail-row" v-if="entry.grandtotal">
                            <span class="detail-icon">💰</span>
                            <span class="detail-label">Total Booking</span>
                            <span class="detail-value" style="font-weight:800">{{ formatCurrency(entry.grandtotal) }}</span>
                        </div>
                    </div>
                </div>

                <div class="modal-footer">
                    <button class="modal-btn-close" @click="cellDetail.show = false">Tutup</button>
                </div>
            </div>
        </div>
    </transition>
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

// ── Time-grid calendar state ──────────────────────────────────
const calView      = ref('week')   // 'day' | 'week' | 'month'
const tgBodyRef    = ref(null)
// weekStart: Monday of the current displayed week (or the single day for day view)
function getMondayOf(date) {
    const d = new Date(date)
    const day = d.getDay()
    const diff = (day === 0 ? -6 : 1 - day)
    d.setDate(d.getDate() + diff)
    d.setHours(0,0,0,0)
    return d
}
const weekStart    = ref(getMondayOf(new Date()))
const hours        = Array.from({ length: 24 }, (_, i) => i)

function setCalView(view) {
    calView.value = view
    if (view === 'day') {
        weekStart.value = new Date(now)
        weekStart.value.setHours(0,0,0,0)
    } else if (view === 'week') {
        weekStart.value = getMondayOf(new Date())
    }
    syncCalendarMonthToWeek()
}

const viewDays = computed(() => {
    const dayShort = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
    const todayStr = toLocalDateStr(now)
    if (calView.value === 'day') {
        const d = new Date(weekStart.value)
        const dateStr = toLocalDateStr(d)
        return [{
            dateStr,
            dayNum: d.getDate(),
            dayName: dayShort[d.getDay()],
            isToday: dateStr === todayStr,
            isWeekend: d.getDay() === 0 || d.getDay() === 6
        }]
    }
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.value)
        d.setDate(d.getDate() + i)
        const dateStr = toLocalDateStr(d)
        return {
            dateStr,
            dayNum: d.getDate(),
            dayName: dayShort[d.getDay()],
            isToday: dateStr === todayStr,
            isWeekend: d.getDay() === 0 || d.getDay() === 6
        }
    })
})

// ── Month view cells ──────────────────────────────────────────
const monthCells = computed(() => {
    const year  = calendarYear.value
    const month = calendarMonth.value
    const todayStr = toLocalDateStr(now)
    const dayShort = ['Min','Sen','Sel','Rab','Kam','Jum','Sab']
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    // pad start to Sunday
    const startPad = firstDay.getDay() // 0=Sun
    // pad end to Saturday
    const endPad   = 6 - lastDay.getDay()
    const cells = []
    for (let i = -startPad; i <= lastDay.getDate() - 1 + endPad; i++) {
        const d = new Date(year, month, 1 + i)
        const dateStr = toLocalDateStr(d)
        cells.push({
            dateStr,
            dayNum: d.getDate(),
            dayName: dayShort[d.getDay()],
            inMonth: d.getMonth() === month,
            isToday: dateStr === todayStr,
            isWeekend: d.getDay() === 0 || d.getDay() === 6
        })
    }
    return cells
})

const weekRangeLabel = computed(() => {
    if (calView.value === 'month') {
        return `${monthNames[calendarMonth.value]} ${calendarYear.value}`
    }
    const days = viewDays.value
    if (!days.length) return ''
    const first = new Date(days[0].dateStr + 'T00:00:00')
    const last  = new Date(days[days.length - 1].dateStr + 'T00:00:00')
    if (calView.value === 'day') {
        return `${monthNames[first.getMonth()].slice(0,3)} ${first.getDate()}, ${first.getFullYear()}`
    }
    if (first.getMonth() === last.getMonth()) {
        return `${monthNames[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`
    }
    return `${monthNames[first.getMonth()].slice(0,3)} ${first.getDate()} – ${monthNames[last.getMonth()].slice(0,3)} ${last.getDate()}, ${last.getFullYear()}`
})

const HOUR_HEIGHT = 60 // px per hour

function timeToMinutes(timeStr) {
    if (!timeStr) return 0
    const [h, m] = timeStr.split(':').map(Number)
    return h * 60 + (m || 0)
}

function getSlotEventStyle(slot, dateStr) {
    const hasBooking = !!getCellStatus(slot.id, dateStr)
    const startMin = timeToMinutes(slot.start_time)
    const endMin   = timeToMinutes(slot.end_time)
    const duration = endMin - startMin
    if (duration <= 0) return null
    if (!hasBooking) return null
    return {
        top:    `${(startMin / 60) * HOUR_HEIGHT}px`,
        height: `${(duration / 60) * HOUR_HEIGHT - 2}px`,
    }
}

function getTgEventClass(slotId, dateStr) {
    const status = getCellStatus(slotId, dateStr)
    if (status === 'CO') return 'tg-event-co'
    if (status === 'WP') return 'tg-event-wp'
    if (status === 'MT') return 'tg-event-mt'
    return 'tg-event-empty'
}

// Get primary customer name for a cell (first CO entry, else first entry)
function getCellCustomerName(slotId, dateStr) {
    const entries = bookingMap.value[`${slotId}-${dateStr}`]
    if (!entries || entries.length === 0) return null
    const co = entries.find(e => e.status === 'CO')
    const entry = co || entries[0]
    return entry.customer_name || null
}

function prevPeriod() {
    if (calView.value === 'month') {
        let m = calendarMonth.value - 1
        let y = calendarYear.value
        if (m < 0) { m = 11; y-- }
        calendarMonth.value = m
        calendarYear.value  = y
        loadCalendarBookingsForCurrentView()
    } else {
        const d = new Date(weekStart.value)
        d.setDate(d.getDate() - (calView.value === 'day' ? 1 : 7))
        weekStart.value = d
        syncCalendarMonthToWeek()
    }
}
function nextPeriod() {
    if (calView.value === 'month') {
        let m = calendarMonth.value + 1
        let y = calendarYear.value
        if (m > 11) { m = 0; y++ }
        calendarMonth.value = m
        calendarYear.value  = y
        loadCalendarBookingsForCurrentView()
    } else {
        const d = new Date(weekStart.value)
        d.setDate(d.getDate() + (calView.value === 'day' ? 1 : 7))
        weekStart.value = d
        syncCalendarMonthToWeek()
    }
}
function goToToday() {
    if (calView.value === 'month') {
        calendarMonth.value = now.getMonth()
        calendarYear.value  = now.getFullYear()
        loadCalendarBookingsForCurrentView()
    } else {
        weekStart.value = calView.value === 'day' ? new Date(now) : getMondayOf(new Date())
        syncCalendarMonthToWeek()
    }
}
function syncCalendarMonthToWeek() {
    const mid = calView.value === 'week'
        ? new Date(weekStart.value.getTime() + 3 * 86400000)
        : new Date(weekStart.value)
    calendarMonth.value = mid.getMonth()
    calendarYear.value  = mid.getFullYear()
}

// When month/year selector changes, jump to week that starts in that month
function onCalendarDateChange() {
    const d = new Date(calendarYear.value, calendarMonth.value, 1)
    weekStart.value = calView.value === 'day' ? d : getMondayOf(d)
    loadCalendarBookingsForCurrentView()
}

async function loadCalendarBookingsForCurrentView() {
    if (!selectedVenueId.value) return
    isLoading.value = true
    try {
        await loadCalendarBookings(selectedVenueId.value)
    } finally {
        isLoading.value = false
    }
}

// ── Cell Detail Modal State ───────────────────────────────────
const cellDetail = ref({
    show: false,
    slotName: '',
    dateLabel: '',
    status: null,
    entries: []
})

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
// bookingMap: keyed by slotId-dateStr, deduplicated by bo_booking_id
const bookingMap = computed(() => {
    const map = {}
    for (const line of calendarBookings.value) {
        const dateStr = (line.tanggal || line.bookingdate || '').slice(0,10)
        if (!dateStr) continue
        if (line.status === 'CL') continue
        const key = `${line.bo_slot_id}-${dateStr}`
        if (!map[key]) map[key] = []
        // Deduplicate: skip if this booking_id already in this cell
        const alreadyExists = map[key].some(e => e.bo_booking_id === line.bo_booking_id)
        if (!alreadyExists) map[key].push(line)
    }
    return map
})

function getCellStatus(slotId, dateStr) {
    const entries = bookingMap.value[`${slotId}-${dateStr}`]
    if (!entries || entries.length === 0) return null
    // Prioritas: CO > MT > WP
    const priority = ['CO','MT','WP']
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
    return 'cell-empty'
}

function getCellIcon(slotId, dateStr) {
    const status = getCellStatus(slotId, dateStr)
    if (!status) return ''
    if (status === 'CO') return '✓'
    if (status === 'WP') return '⏳'
    if (status === 'MT') return '🔧'
    return ''
}

function getCellTooltip(slotId, dateStr) {
    const entries = bookingMap.value[`${slotId}-${dateStr}`]
    if (!entries || entries.length === 0) return 'Kosong'
    return entries.map(e => `${e.status}`).join(', ')
}

function openCellDetail(slotId, dateStr) {
    const entries = bookingMap.value[`${slotId}-${dateStr}`]
    if (!entries || entries.length === 0) return

    const status = getCellStatus(slotId, dateStr)
    if (!['CO', 'MT', 'WP'].includes(status)) return

    const slot = venueSlots.value.find(s => s.id === slotId)
    const dateObj = new Date(dateStr + 'T00:00:00')
    const dayShort = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu']
    const dateLabel = `${dayShort[dateObj.getDay()]}, ${dateObj.getDate()} ${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`

    cellDetail.value = {
        show: true,
        slotName: slot ? `${slot.name} (${slot.start_time?.slice(0,5)}–${slot.end_time?.slice(0,5)})` : `Slot`,
        dateLabel,
        status,
        entries: entries.filter(e => e.status === status)
    }
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
    // ── Tiru persis listSchedules di booking.js (customer) ──
    // Step 1: bo_bookingline via embed filter bo_booking!inner
    const { data: regularData } = await supabase
        .from('bo_bookingline')
        .select(`
            tanggal,
            bo_slot_id,
            price,
            bo_booking!inner(status, id, bo_venue_id)
        `)
        .eq('bo_booking.bo_venue_id', venueId)
        .in('bo_booking.status', ['WP', 'CO', 'MT'])
        .eq('isactive', true)

    // Step 2: bo_bookingline_jogging via embed filter bo_booking!inner
    const { data: joggingData } = await supabase
        .from('bo_bookingline_jogging')
        .select(`
            tanggal,
            bo_slot_id,
            price,
            jumlah_orang,
            harga_per_orang,
            bo_booking!inner(status, id)
        `)
        .eq('bo_venue_id', venueId)
        .in('bo_booking.status', ['WP', 'CO', 'MT'])
        .eq('isactive', true)

    // Kumpulkan semua booking IDs unik dari kedua query
    const allBookingIds = []
    ;(regularData || []).forEach(r => { if (r.bo_booking?.id) allBookingIds.push(r.bo_booking.id) })
    ;(joggingData || []).forEach(r => { if (r.bo_booking?.id) allBookingIds.push(r.bo_booking.id) })
    const uniqueBookingIds = [...new Set(allBookingIds)]

    // Step 3: Fetch hanya field yang PASTI ada di bo_booking admin project
    // (booking_no & notes tidak ada di schema admin - hanya pakai field yang terbukti dari CRUDOrder)
    const bookingLookup = {}
    if (uniqueBookingIds.length > 0) {
        const { data: bookingDetails, error: bookingErr } = await supabase
            .from('bo_booking')
            .select('id, grandtotal, bo_user_id')
            .in('id', uniqueBookingIds)

        if (bookingErr) console.warn('bo_booking fetch error:', bookingErr)

        // Step 4: Fetch bo_user terpisah pakai bo_user_id yang didapat
        const userIds = [...new Set((bookingDetails || []).map(b => b.bo_user_id).filter(Boolean))]
        const userLookup = {}
        if (userIds.length > 0) {
            const { data: users, error: userErr } = await supabase
                .from('bo_user')
                .select('id, name, email, phone, companyname')
                .in('id', userIds)
            if (userErr) console.warn('bo_user fetch error:', userErr)
            ;(users || []).forEach(u => { userLookup[u.id] = u })
        }

        ;(bookingDetails || []).forEach(b => {
            bookingLookup[b.id] = {
                ...b,
                bo_user: userLookup[b.bo_user_id] || null
            }
        })
    }

    // Helper: transform line + inject customer detail
    function transform(lines) {
        return (lines || []).map(line => {
            const bookingId = line.bo_booking?.id
            const b = bookingLookup[bookingId] || {}
            return {
                tanggal:          line.tanggal,
                bo_slot_id:       line.bo_slot_id,
                bo_booking_id:    bookingId,
                status:           line.bo_booking?.status  || null,
                price:            line.price               || null,
                jumlah_orang:     line.jumlah_orang        || null,
                harga_per_orang:  line.harga_per_orang     || null,
                grandtotal:       b.grandtotal             || null,
                customer_name:    b.bo_user?.name          || null,
                customer_email:   b.bo_user?.email         || null,
                customer_phone:   b.bo_user?.phone         || null,
                customer_company: b.bo_user?.companyname   || null,
            }
        })
    }

    calendarBookings.value = [...transform(regularData), ...transform(joggingData)]
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
    const labels = ['CO', 'WP', 'MT']
    const data   = labels.map(l => counts[l] || 0)
    const total  = data.reduce((a,b)=>a+b,0)
    if (total === 0) return

    statusChartInstance = new Chart(statusChartRef.value, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: ['#10b981','#f59e0b','#6366f1'],
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
    // Scroll to 8am
    await nextTick()
    if (tgBodyRef.value) {
        tgBodyRef.value.scrollTop = 8 * HOUR_HEIGHT
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
    overflow-x: hidden;
    max-width: 100%;
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
.badge-mt { background: #e0e7ff; color: #4338ca; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem; }
.badge-cl { background: #fee2e2; color: #dc2626; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 0.7rem; }

/* ── Cell Detail Modal ── */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
    padding: 1rem;
    backdrop-filter: blur(2px);
}
.modal-card {
    background: #fff;
    border-radius: 16px;
    width: 100%;
    max-width: 420px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    overflow: hidden;
}
.modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.25rem 1.35rem 0.75rem;
    border-bottom: 1px solid #f0f0f0;
}
.modal-title-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
}
.modal-title {
    font-size: 0.95rem;
    font-weight: 700;
    margin: 0;
    color: #1a1d23;
}
.modal-close {
    background: #f3f4f6;
    border: none;
    border-radius: 8px;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 0.75rem;
    color: #6b7280;
    flex-shrink: 0;
    transition: background 0.15s;
}
.modal-close:hover { background: #e5e7eb; }
.modal-status-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    width: fit-content;
}
.mbadge-co { background: #d1fae5; color: #059669; }
.mbadge-wp { background: #fef3c7; color: #d97706; }
.mbadge-mt { background: #e0e7ff; color: #4338ca; }
.mbadge-cl { background: #fee2e2; color: #dc2626; }

.modal-date-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.35rem;
    background: #f8fafc;
    font-size: 0.82rem;
    color: #6b7280;
    font-weight: 600;
    border-bottom: 1px solid #f0f0f0;
}
.modal-date-icon { font-size: 0.85rem; }

.modal-body {
    padding: 1rem 1.35rem;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    max-height: 50vh;
    overflow-y: auto;
}
.detail-entry { display: flex; flex-direction: column; gap: 0.5rem; }
.detail-divider { border-top: 1px dashed #e5e7eb; margin: 0.5rem 0; }
.detail-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    background: #f8fafc;
    border-radius: 8px;
}
.detail-icon { font-size: 0.85rem; flex-shrink: 0; }
.detail-label { font-size: 0.75rem; color: #9ca3af; font-weight: 600; width: 90px; flex-shrink: 0; }
.detail-value { font-size: 0.83rem; font-weight: 700; color: #1a1d23; flex: 1; }
.detail-mono { font-family: 'JetBrains Mono', monospace; }
.detail-green { color: #16a34a; }

.mt-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 1rem;
    background: #eef2ff;
    border-radius: 10px;
    margin-bottom: 0.75rem;
}
.mt-icon { font-size: 1.5rem; }
.mt-title { font-size: 0.88rem; font-weight: 700; color: #4338ca; }
.mt-sub { font-size: 0.75rem; color: #6366f1; margin-top: 0.1rem; }

.modal-footer {
    padding: 0.85rem 1.35rem;
    border-top: 1px solid #f0f0f0;
    display: flex;
    justify-content: flex-end;
}
.modal-btn-close {
    padding: 0.45rem 1.25rem;
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.83rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
}
.modal-btn-close:hover { background: #4f46e5; }

/* Modal Transition */
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; }
.modal-fade-enter-active .modal-card,
.modal-fade-leave-active .modal-card { transition: transform 0.2s ease; }
.modal-fade-enter-from .modal-card { transform: scale(0.95) translateY(10px); }
.modal-fade-leave-to .modal-card { transform: scale(0.95) translateY(10px); }

/* ── Charts Row ── */
.charts-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 1rem;
    margin-bottom: 1.5rem;
    min-width: 0;
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
    min-width: 0;
    overflow: hidden;
}
.chart-card-header { margin-bottom: 1rem; }
.chart-title { font-size: 0.95rem; font-weight: 700; margin: 0; }
.chart-wrapper { position: relative; height: 220px; width: 100%; }
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
.cell-co    { background: #d1fae5; color: #059669; cursor: pointer; }
.cell-wp    { background: #fef3c7; color: #d97706; cursor: pointer; }
.cell-mt    { background: #e0e7ff; color: #4338ca; cursor: pointer; }
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
/* ── Time-grid calendar ── */
.tg-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
    flex-wrap: wrap;
    gap: 0.5rem;
}
.tg-toolbar-left, .tg-toolbar-right { display: flex; align-items: center; gap: 0.4rem; }
.tg-range-label { font-size: 0.95rem; font-weight: 700; color: #1a1d23; margin-left: 0.4rem; }
.tg-btn {
    padding: 0.3rem 0.85rem;
    border-radius: 7px;
    border: 1.5px solid #e5e7eb;
    background: #f9fafb;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: #4b5563;
    cursor: pointer;
    transition: all 0.13s;
}
.tg-btn:hover { border-color: #6366f1; color: #6366f1; }
.tg-btn.tg-btn-active { background: #6366f1; border-color: #6366f1; color: #fff; }
.tg-nav { padding: 0.3rem 0.7rem; font-size: 1.1rem; }

.tg-wrapper {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
}

/* sticky header */
.tg-header-row {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 10;
    background: #f8fafc;
    border-bottom: 2px solid #e5e7eb;
}
.tg-time-gutter {
    width: 56px;
    flex-shrink: 0;
    border-right: 1px solid #e5e7eb;
}
.tg-day-header {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.4rem 0.2rem;
    border-right: 1px solid #f0f0f0;
    min-width: 0;
}
.tg-dayname { font-size: 0.62rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.04em; }
.tg-daynum  { font-size: 0.9rem; font-weight: 700; color: #374151; }
.tg-today .tg-daynum { color: #6366f1; background: #eef2ff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; }
.tg-weekend .tg-dayname { color: #f43f5e; }

/* scrollable body */
.tg-body-scroll {
    max-height: 600px;
    overflow-y: auto;
    overflow-x: hidden;
}
.tg-body {
    position: relative;
}
.tg-hour-row {
    display: flex;
    height: 60px;
    border-bottom: 1px solid #f0f0f0;
}
.tg-time-label {
    width: 56px;
    flex-shrink: 0;
    font-size: 0.65rem;
    font-weight: 600;
    color: #9ca3af;
    font-family: 'JetBrains Mono', monospace;
    text-align: right;
    padding: 0 8px 0 0;
    margin-top: -0.5em;
    border-right: 1px solid #e5e7eb;
}
.tg-hour-cell {
    flex: 1;
    border-right: 1px solid #f0f0f0;
}
.tg-today-col { background: rgba(99,102,241,0.03); }

/* events overlay */
.tg-events-layer {
    position: absolute;
    inset: 0;
    display: flex;
    pointer-events: none;
}
.tg-events-gutter {
    width: 56px;
    flex-shrink: 0;
}
.tg-events-col {
    flex: 1;
    position: relative;
    pointer-events: auto;
    min-width: 0;
}
.tg-event {
    position: absolute;
    left: 2px;
    right: 2px;
    border-radius: 5px;
    padding: 3px 6px;
    overflow: hidden;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1.3;
    z-index: 2;
    border-left: 3px solid transparent;
    transition: filter 0.12s;
}
.tg-event:hover { filter: brightness(0.92); }
.tg-event-title { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-event-time  { font-size: 0.62rem; opacity: 0.85; }
.tg-event-venue { font-size: 0.6rem; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* event colors – same palette as before */
.tg-event-co  { background: #4a8f3f; color: #fff; border-left-color: #2d6a25; }
.tg-event-wp  { background: #f59e0b; color: #fff; border-left-color: #d97706; }
.tg-event-mt  { background: #6366f1; color: #fff; border-left-color: #4338ca; }
.tg-event-empty { background: #f3f4f6; color: #6b7280; border-left-color: #d1d5db; }

/* ── Month view ── */
.tg-month-wrapper {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
}
.tg-month-head {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    background: #f8fafc;
    border-bottom: 2px solid #e5e7eb;
    width: 100%;
}
.tg-month-headcell {
    text-align: center;
    padding: 0.4rem 0;
    font-size: 0.65rem;
    font-weight: 700;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.tg-month-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    width: 100%;
}
.tg-month-cell {
    min-height: 100px;
    border-right: 1px solid #f0f0f0;
    border-bottom: 1px solid #f0f0f0;
    padding: 4px;
    position: relative;
    background: #fff;
}
.tg-month-cell:nth-child(7n) { border-right: none; }
.tg-month-cell-other { background: #fafafa; }
.tg-month-cell-other .tg-month-daynum { color: #d1d5db; }
.tg-month-cell-today { background: #eef2ff; }
.tg-month-cell-today .tg-month-daynum {
    color: #fff;
    background: #6366f1;
    border-radius: 50%;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.tg-month-cell-weekend .tg-month-daynum { color: #f43f5e; }
.tg-month-cell-today.tg-month-cell-weekend .tg-month-daynum { color: #fff; }
.tg-month-daynum {
    font-size: 0.72rem;
    font-weight: 700;
    color: #374151;
    margin-bottom: 3px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.tg-month-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.tg-month-chip {
    border-radius: 4px;
    padding: 2px 5px;
    font-size: 0.62rem;
    font-weight: 700;
    cursor: pointer;
    overflow: hidden;
    line-height: 1.3;
    transition: filter 0.12s;
}
.tg-month-chip:hover { filter: brightness(0.9); }
.tg-month-chip-name { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tg-month-chip-customer {
    display: block;
    font-weight: 500;
    opacity: 0.85;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.58rem;
}
.tg-event-customer {
    font-size: 0.62rem;
    opacity: 0.9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
}

/* ── Responsive mobile ── */
@media (max-width: 640px) {
    .dashboard-root { padding: 0.75rem; }
    .dash-title { font-size: 1.2rem; }
    .summary-grid { grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .card-value { font-size: 1.1rem; }

    /* Charts: stack vertically, reduce height so they don't overflow */
    .charts-row { grid-template-columns: 1fr; gap: 0.75rem; }
    .chart-wrapper { height: 160px; }
    .chart-wrapper-donut { height: 130px; }

    /* Calendar header */
    .calendar-header { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    .calendar-header-top { flex-direction: column; align-items: flex-start; gap: 0.5rem; width: 100%; }
    .calendar-selectors { flex-wrap: wrap; }
    .calendar-legend { gap: 0.4rem; flex-wrap: wrap; }

    /* Venue tabs */
    .venue-tab-buttons { gap: 0.3rem; flex-wrap: wrap; }
    .venue-tab-btn { font-size: 0.72rem; padding: 0.3rem 0.65rem; }

    /* Toolbar */
    .tg-toolbar { flex-direction: column; align-items: flex-start; gap: 0.4rem; }
    .tg-toolbar-left { gap: 0.3rem; }
    .tg-toolbar-right { align-self: flex-end; }
    .tg-range-label { font-size: 0.8rem; }

    /* Day/Week time grid */
    .tg-time-gutter, .tg-events-gutter { width: 36px; }
    .tg-time-label { width: 36px; font-size: 0.58rem; padding-right: 4px; }
    .tg-hour-row { height: 50px; }
    .tg-day-header { padding: 0.3rem 0.1rem; }
    .tg-dayname { font-size: 0.55rem; }
    .tg-daynum  { font-size: 0.78rem; }
    .tg-event { padding: 2px 4px; }
    .tg-event-title { font-size: 0.6rem; }
    .tg-event-time, .tg-event-customer, .tg-event-venue { font-size: 0.55rem; }

    /* Month view: horizontal scroll with fixed equal cell widths */
    .tg-month-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tg-month-head { grid-template-columns: repeat(7, 68px); width: auto; }
    .tg-month-grid { grid-template-columns: repeat(7, 68px); width: auto; }
    .tg-month-cell { min-height: 80px; padding: 2px; width: 68px; }
    .tg-month-chip { font-size: 0.6rem; padding: 2px 4px; }
    .tg-month-chip-name { font-size: 0.6rem; }
    .tg-month-chip-customer { font-size: 0.55rem; }
    .tg-month-headcell { font-size: 0.6rem; padding: 0.35rem 0; }
    .tg-month-daynum { font-size: 0.68rem; }

    /* Modal */
    .modal-card { width: 95vw; padding: 1rem; }
}
@media (max-width: 400px) {
    .summary-grid { grid-template-columns: 1fr; }
    .chart-wrapper { height: 140px; }
}
</style>