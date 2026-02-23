<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <div class="header-info">
          <h2>Detail Penggunaan Kode Referral</h2>
          <p class="referral-code">{{ referral.code }}</p>
        </div>
        <button @click="$emit('close')" class="btn-close">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- Summary Stats -->
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Penggunaan</div>
            <div class="stat-value">
              {{ usageList.length }}
              <span v-if="referral.max_usage" class="stat-max">
                / {{ referral.max_usage }}
              </span>
              <span v-else class="stat-max">/ ∞</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Total Diskon Diberikan</div>
            <div class="stat-value">Rp {{ formatCurrency(totalDiscount) }}</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Unique Users</div>
            <div class="stat-value">{{ uniqueUsers }}</div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Nilai Diskon</div>
            <div class="stat-value">
              <span v-if="referral.discount_type === 'percentage'">
                {{ referral.discount_value }}%
              </span>
              <span v-else> Rp {{ formatCurrency(referral.discount_value) }} </span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-label">Penerapan Diskon</div>
            <div class="stat-value apply-value">
              <span v-if="referral.discount_apply_to === 'per_slot'">
                🎟️ Per Slot
              </span>
              <span v-else>
                💰 Total
              </span>
            </div>
            <div class="stat-sublabel">
              <span v-if="referral.discount_apply_to === 'per_slot'">Dikalikan jumlah slot</span>
              <span v-else>Dari total booking</span>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
          <div class="spinner"></div>
          <p>Memuat data penggunaan...</p>
        </div>

        <!-- Usage List -->
        <div v-else class="usage-list">
          <h3>Riwayat Penggunaan ({{ usageList.length }})</h3>

          <div v-if="usageList.length === 0" class="empty-state">
            <p>Belum ada penggunaan untuk kode referral ini</p>
          </div>

          <template v-else>
            <!-- Desktop Table View -->
            <div class="table-container desktop-view">
              <table class="usage-table">
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th>User</th>
                    <th>Booking ID</th>
                    <th>Penerapan</th>
                    <th>Diskon Diberikan</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="usage in usageList" :key="usage.id">
                    <td>
                      <div class="date-cell">
                        {{ formatDateTime(usage.used_at) }}
                      </div>
                    </td>
                    <td>
                      <div class="user-cell">
                        <strong>{{ usage.user?.name || "-" }}</strong>
                        <small>{{ usage.user?.email || "-" }}</small>
                      </div>
                    </td>
                    <td>
                      <code class="booking-id">{{ formatBookingId(usage.bo_booking_id) }}</code>
                    </td>
                    <td>
                      <span class="apply-badge" :class="referral.discount_apply_to === 'per_slot' ? 'per-slot' : 'total'">
                        {{ referral.discount_apply_to === 'per_slot' ? '🎟️ Per Slot' : '💰 Total' }}
                      </span>
                    </td>
                    <td>
                      <span class="discount-amount">
                        Rp {{ formatCurrency(usage.discount_amount) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Mobile Card View -->
            <div class="mobile-view">
              <div
                v-for="usage in usageList"
                :key="usage.id"
                class="usage-card"
              >
                <div class="usage-card-header">
                  <div class="date-cell">
                    {{ formatDateTime(usage.used_at) }}
                  </div>
                  <span class="discount-amount">
                    Rp {{ formatCurrency(usage.discount_amount) }}
                  </span>
                </div>

                <div class="usage-card-body">
                  <div class="info-row">
                    <span class="info-label">User:</span>
                    <div class="user-info">
                      <strong>{{ usage.user?.name || "-" }}</strong>
                      <small>{{ usage.user?.email || "-" }}</small>
                    </div>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Booking ID:</span>
                    <code class="booking-id-mobile">{{ formatBookingId(usage.bo_booking_id) }}</code>
                  </div>

                  <div class="info-row">
                    <span class="info-label">Penerapan:</span>
                    <span class="apply-badge" :class="referral.discount_apply_to === 'per_slot' ? 'per-slot' : 'total'">
                      {{ referral.discount_apply_to === 'per_slot' ? '🎟️ Per Slot' : '💰 Total' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import RestService from "../../services/rest";

const svc = new RestService("bo_referral_usage");

const props = defineProps({
  referral: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["close"]);

const loading = ref(false);
const usageList = ref([]);

const totalDiscount = computed(() => {
  return usageList.value.reduce((sum, usage) => sum + (usage.discount_amount || 0), 0);
});

const uniqueUsers = computed(() => {
  const userIds = new Set(usageList.value.map((u) => u.bo_user_id));
  return userIds.size;
});

onMounted(() => {
  loadUsageData();
});

async function loadUsageData() {
  loading.value = true;
  try {
    // Perbaikan: gunakan listwhere dengan parameter yang benar
    const whereclause = [
      {
        field: 'bo_referral_id',
        op: 'eq',
        value: props.referral.id
      }
    ];

    const result = await svc.listwhere(
      0,
      1000,
      whereclause,
      { col: 'used_at', ascending: false }
    );

    if (result.error) throw result.error;

    // Load data user secara terpisah
    if (result.data && result.data.length > 0) {
      const userIds = [...new Set(result.data.map(u => u.bo_user_id).filter(id => id))];
      const users = {};

      if (userIds.length > 0) {
        const svcUser = new RestService("bo_user");
        const userWhere = [
          {
            field: 'id',
            op: 'in',
            value: userIds
          }
        ];

        const userResult = await svcUser.listwhere(0, 250, userWhere);
        if (userResult.data) {
          userResult.data.forEach(u => {
            users[u.id] = u;
          });
        }
      }

      // Tambahkan relasi user ke setiap usage
      usageList.value = result.data.map(u => ({
        ...u,
        user: u.bo_user_id ? users[u.bo_user_id] : null
      }));
    } else {
      usageList.value = [];
    }
  } catch (error) {
    console.error("Error loading usage data:", error);
    alert("Error memuat data penggunaan: " + error.message);
  } finally {
    loading.value = false;
  }
}

function formatCurrency(value) {
  if (!value) return "0";
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDateTime(dateTime) {
  if (!dateTime) return "-";
  return new Date(dateTime).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBookingId(id) {
  if (!id) return "-";
  // Truncate UUID untuk display
  return id.substring(0, 8).toUpperCase();
}
</script>

<style scoped>
.icon-sm {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999; /* Di atas sidebar yang z-9999 */
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 1100px; /* Diperbesar untuk memberikan lebih banyak ruang */
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
  border-radius: 12px 12px 0 0;
  gap: 1rem;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.modal-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a202c;
  margin: 0 0 0.5rem 0;
}

.referral-code {
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b82f6;
  font-family: "Courier New", monospace;
  margin: 0;
  word-break: break-all;
}

.btn-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #475569;
}

.modal-body {
  padding: 1.5rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* 5 kolom: +penerapan */
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1.5rem;
  border-radius: 12px;
  color: white;
  text-align: center;
}

.stat-card:nth-child(2) {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.stat-card:nth-child(3) {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.stat-card:nth-child(4) {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.stat-card:nth-child(5) {
  background: linear-gradient(135deg, #fa8231 0%, #f7b731 100%);
}

.stat-sublabel {
  font-size: 0.72rem;
  opacity: 0.85;
  margin-top: 0.25rem;
}

.apply-value {
  font-size: 1.4rem;
}

.stat-label {
  font-size: 0.85rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.2;
}

.stat-max {
  font-size: 1.25rem;
  opacity: 0.8;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #64748b;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.usage-list h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 1rem;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #94a3b8;
}

/* Desktop Table View */
.desktop-view {
  display: block !important;
}

.mobile-view {
  display: none !important;
}

.table-container {
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.usage-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 800px; /* Diperbesar untuk lebih banyak ruang */
}

.usage-table thead {
  background: #f8fafc;
}

.usage-table th {
  padding: 1rem 1.25rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.875rem;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid #e2e8f0;
}

.usage-table td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
}

.usage-table tr:hover {
  background: #f8fafc;
}

.date-cell {
  color: #475569;
  font-size: 0.9rem;
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.user-cell strong {
  color: #1e293b;
}

.user-cell small {
  color: #64748b;
  font-size: 0.85rem;
}

.booking-id {
  background: #f1f5f9;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: "Courier New", monospace;
  font-size: 0.85rem;
  color: #475569;
}

.discount-amount {
  font-weight: 600;
  color: #059669;
  font-size: 1rem;
}

.apply-badge {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.apply-badge.per-slot {
  background: #fef3c7;
  color: #92400e;
}

.apply-badge.total {
  background: #ede9fe;
  color: #5b21b6;
}

/* Mobile Card View */
.usage-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.usage-card:last-child {
  margin-bottom: 0;
}

.usage-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  gap: 0.5rem;
}

.usage-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.info-label {
  color: #64748b;
  font-weight: 500;
  min-width: 80px;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: right;
  flex: 1;
  min-width: 0;
}

.user-info strong {
  color: #1e293b;
  word-break: break-word;
}

.user-info small {
  color: #64748b;
  font-size: 0.8rem;
  word-break: break-all;
}

.booking-id-mobile {
  background: #f1f5f9;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: "Courier New", monospace;
  font-size: 0.75rem;
  color: #475569;
}

/* Responsive Styles */
@media (max-width: 1024px) {
  .modal-content {
    max-width: 95%;
  }

  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal-content {
    max-height: 95vh;
    border-radius: 12px 12px 0 0;
  }

  .modal-header {
    padding: 1.25rem;
  }

  .modal-header h2 {
    font-size: 1.25rem;
  }

  .referral-code {
    font-size: 1.1rem;
  }

  .modal-body {
    padding: 1.25rem;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }

  .stat-card {
    padding: 1.25rem;
  }

  .stat-label {
    font-size: 0.8rem;
  }

  .stat-value {
    font-size: 1.5rem;
  }

  .stat-max {
    font-size: 1.1rem;
  }

  .usage-list h3 {
    font-size: 1.1rem;
  }

  /* Hide desktop table, show mobile cards */
  .desktop-view {
    display: none !important;
  }

  .mobile-view {
    display: block !important;
  }
}

@media (max-width: 480px) {
  .modal-header {
    padding: 1rem;
  }

  .modal-header h2 {
    font-size: 1.1rem;
  }

  .referral-code {
    font-size: 1rem;
  }

  .modal-body {
    padding: 1rem;
  }

  .stats-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  .stat-card {
    padding: 1rem;
  }

  .stat-label {
    font-size: 0.75rem;
  }

  .stat-value {
    font-size: 1.35rem;
  }

  .stat-max {
    font-size: 1rem;
  }

  .usage-list h3 {
    font-size: 1rem;
  }

  .usage-card {
    padding: 0.85rem;
  }

  .usage-card-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .discount-amount {
    font-size: 0.95rem;
  }

  .info-row {
    font-size: 0.8rem;
  }

  .info-label {
    min-width: 70px;
  }
}

@media (max-height: 600px) {
  .modal-content {
    max-height: 100vh;
    border-radius: 0;
  }

  .modal-overlay {
    padding: 0;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>