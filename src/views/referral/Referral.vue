<template>
  <div class="referral-page">
    <div class="page-header">
      <h1>Kelola Kode Referral</h1>
      <div class="header-actions">
        <button @click="handleAutoDeactivate" class="btn btn-secondary">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
          </svg>
          <span class="btn-text">Auto Deactivate</span>
        </button>
        <button @click="openCreateModal" class="btn btn-primary">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span class="btn-text">Buat Kode</span>
        </button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="filter-tabs">
      <button
        :class="['tab', { active: filter === 'all' }]"
        @click="filter = 'all'"
      >
        <span class="tab-label">Semua</span> ({{ allCount }})
      </button>
      <button
        :class="['tab', { active: filter === 'active' }]"
        @click="filter = 'active'"
      >
        <span class="tab-label">Aktif</span> ({{ activeCount }})
      </button>
      <button
        :class="['tab', { active: filter === 'inactive' }]"
        @click="filter = 'inactive'"
      >
        <span class="tab-label">Nonaktif</span> ({{ inactiveCount }})
      </button>
      <button
        :class="['tab', { active: filter === 'expired' }]"
        @click="filter = 'expired'"
      >
        <span class="tab-label">Expired</span> ({{ expiredCount }})
      </button>
    </div>

    <!-- Search -->
    <div class="search-box">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Cari kode referral..."
        class="search-input"
      />
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Memuat data...</p>
    </div>

    <!-- Table for Desktop, Cards for Mobile -->
    <div v-else>
      <!-- Desktop Table View -->
      <div class="table-container desktop-view">
        <table class="referral-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Kode</th>
              <th>Diskon</th>
              <th>Venue</th>
              <th>Periode</th>
              <th>Hari</th>
              <th>Jam</th>
              <th>Penggunaan</th>
              <th>Min. Transaksi</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ref in filteredReferrals"
              :key="ref.id"
              :class="{ inactive: !ref.isactive }"
            >
              <!-- Status -->
              <td>
                <span :class="['status-badge', getStatusClass(ref)]">
                  {{ getStatusLabel(ref) }}
                </span>
              </td>

              <!-- Kode & Deskripsi -->
              <td>
                <div class="code-cell">
                  <div class="code-wrapper">
                    <strong class="code">{{ ref.code }}</strong>
                    <button 
                      @click="copyCode(ref.code)" 
                      class="btn-copy-code"
                      title="Salin kode"
                    >
                      <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                  </div>
                  <small v-if="ref.description" class="description">{{
                    ref.description
                  }}</small>
                </div>
              </td>

              <!-- Diskon -->
              <td>
                <div class="discount-cell">
                  <span v-if="ref.discount_type === 'percentage'">
                    {{ ref.discount_value }}%
                    <small v-if="ref.max_discount" class="max-discount">
                      (max Rp {{ formatCurrency(ref.max_discount) }})
                    </small>
                  </span>
                  <span v-else> Rp {{ formatCurrency(ref.discount_value) }} </span>
                  <span :class="['badge-apply', ref.discount_apply_to === 'per_slot' ? 'badge-per-slot' : 'badge-total']">
                    {{ ref.discount_apply_to === 'per_slot' ? '× per slot' : '÷ total' }}
                  </span>
                </div>
              </td>

              <!-- Venue -->
              <td>
                <span class="venue-name">
                  {{ ref.bo_venue?.name || "Semua Venue" }}
                </span>
              </td>

              <!-- Periode -->
              <td>
                <div class="date-range">
                  {{ formatDate(ref.start_date) }}
                  <br />
                  s/d {{ formatDate(ref.end_date) }}
                  <span v-if="isExpired(ref.end_date)" class="badge-expired">
                    Expired
                  </span>
                </div>
              </td>

              <!-- Hari -->
              <td>
                <span v-if="ref.allowed_days" class="days-chips">
                  <span
                    v-for="d in parseDays(ref.allowed_days)"
                    :key="d.value"
                    class="day-badge"
                  >{{ d.label }}</span>
                </span>
                <span v-else class="all-time">Semua Hari</span>
              </td>

              <!-- Jam -->
              <td>
                <span v-if="ref.start_time && ref.end_time" class="time-range">
                  {{ ref.start_time.substring(0, 5) }} -
                  {{ ref.end_time.substring(0, 5) }}
                </span>
                <span v-else class="all-time">Semua Jam</span>
              </td>

              <!-- Penggunaan -->
              <td>
                <div class="usage-cell">
                  <div class="usage-display">
                    <span class="usage-current">{{ ref.current_usage || 0 }}</span>
                    <span class="usage-separator"> / </span>
                    <span class="usage-max">{{ ref.max_usage || '∞' }}</span>
                  </div>
                  <button
                    @click="viewUsageDetail(ref)"
                    class="btn-view-usage"
                    title="Lihat detail penggunaan"
                  >
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 3v18h18M7 16l4-4 4 4 6-6"/>
                    </svg>
                  </button>
                </div>
              </td>

              <!-- Min Transaksi -->
              <td>
                <span class="min-transaction">
                  {{ ref.min_transaction > 0 ? 'Rp ' + formatCurrency(ref.min_transaction) : '-' }}
                </span>
              </td>

              <!-- Aksi -->
              <td>
                <div class="action-buttons">
                  <!-- Toggle Active -->
                  <button
                    @click="toggleActive(ref)"
                    :class="[
                      'btn-icon',
                      ref.isactive ? 'btn-deactivate' : 'btn-activate',
                    ]"
                    :title="ref.isactive ? 'Nonaktifkan' : 'Aktifkan'"
                  >
                    <svg v-if="ref.isactive" class="icon-sm" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                    <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                    </svg>
                  </button>

                  <!-- Edit -->
                  <button
                    @click="openEditModal(ref)"
                    class="btn-icon btn-edit"
                    title="Edit"
                  >
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>

                  <!-- Delete -->
                  <button
                    @click="deleteReferral(ref)"
                    class="btn-icon btn-delete"
                    title="Hapus"
                  >
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="filteredReferrals.length === 0">
              <td colspan="10" class="empty-state">
                <p>Tidak ada data kode referral</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Card View -->
      <div class="mobile-view">
        <div v-if="filteredReferrals.length === 0" class="empty-state">
          <p>Tidak ada data kode referral</p>
        </div>
        <div v-else class="cards-container">
          <div
            v-for="ref in filteredReferrals"
            :key="ref.id"
            :class="['referral-card', { inactive: !ref.isactive }]"
          >
            <div class="card-header">
              <div class="card-title">
                <div class="code-wrapper">
                  <strong class="code">{{ ref.code }}</strong>
                  <button 
                    @click="copyCode(ref.code)" 
                    class="btn-copy-code"
                    title="Salin kode"
                  >
                    <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>
                <span :class="['status-badge', getStatusClass(ref)]">
                  {{ getStatusLabel(ref) }}
                </span>
              </div>
              <div class="action-buttons">
                <button
                  @click="toggleActive(ref)"
                  :class="[
                    'btn-icon',
                    ref.isactive ? 'btn-deactivate' : 'btn-activate',
                  ]"
                  :title="ref.isactive ? 'Nonaktifkan' : 'Aktifkan'"
                >
                  <svg v-if="ref.isactive" class="icon-sm" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                  </svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                </button>
                <button
                  @click="openEditModal(ref)"
                  class="btn-icon btn-edit"
                  title="Edit"
                >
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  @click="deleteReferral(ref)"
                  class="btn-icon btn-delete"
                  title="Hapus"
                >
                  <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="ref.description" class="card-description">
              {{ ref.description }}
            </div>

            <div class="card-info">
              <div class="info-row">
                <span class="info-label">Diskon:</span>
                <span class="info-value">
                  <span class="discount-value" v-if="ref.discount_type === 'percentage'">
                    {{ ref.discount_value }}%
                    <small v-if="ref.max_discount">
                      (max Rp {{ formatCurrency(ref.max_discount) }})
                    </small>
                  </span>
                  <span v-else> Rp {{ formatCurrency(ref.discount_value) }} </span>
                  <span :class="['badge-apply', ref.discount_apply_to === 'per_slot' ? 'badge-per-slot' : 'badge-total']">
                    {{ ref.discount_apply_to === 'per_slot' ? '× per slot' : '÷ total' }}
                  </span>
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Venue:</span>
                <span class="info-value">{{ ref.bo_venue?.name || "Semua Venue" }}</span>
              </div>

              <div class="info-row">
                <span class="info-label">Periode:</span>
                <span class="info-value">
                  {{ formatDate(ref.start_date) }} s/d {{ formatDate(ref.end_date) }}
                  <span v-if="isExpired(ref.end_date)" class="badge-expired">Expired</span>
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Hari:</span>
                <span class="info-value">
                  <span v-if="ref.allowed_days" class="days-chips">
                    <span
                      v-for="d in parseDays(ref.allowed_days)"
                      :key="d.value"
                      class="day-badge"
                    >{{ d.label }}</span>
                  </span>
                  <span v-else class="all-time">Semua Hari</span>
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Jam:</span>
                <span class="info-value">
                  <span v-if="ref.start_time && ref.end_time">
                    {{ ref.start_time.substring(0, 5) }} - {{ ref.end_time.substring(0, 5) }}
                  </span>
                  <span v-else class="all-time">Semua Jam</span>
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Penggunaan:</span>
                <span class="info-value">
                  <div class="usage-mobile-display">
                    <span class="usage-current">{{ ref.current_usage || 0 }}</span>
                    <span class="usage-separator"> / </span>
                    <span class="usage-max">{{ ref.max_usage || '∞' }}</span>
                  </div>
                  <button
                    @click="viewUsageDetail(ref)"
                    class="btn-view-usage-inline"
                    title="Lihat detail"
                  >
                    <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 3v18h18M7 16l4-4 4 4 6-6"/>
                    </svg>
                  </button>
                </span>
              </div>

              <div class="info-row">
                <span class="info-label">Min. Transaksi:</span>
                <span class="info-value">
                  {{ ref.min_transaction > 0 ? 'Rp ' + formatCurrency(ref.min_transaction) : '-' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Form -->
    <ReferralFormModal
      v-if="showFormModal"
      :referral="selectedReferral"
      :venues="venues"
      @close="closeFormModal"
      @success="handleFormSuccess"
    />

    <!-- Modal Usage Detail -->
    <ReferralUsageModal
      v-if="showUsageModal"
      :referral="selectedReferral"
      @close="handleUsageModalClose"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import RestService from "../../services/rest";
import ReferralFormModal from "./ReferralFormModal.vue";
import ReferralUsageModal from "./ReferralUsageModal.vue";

const svc = new RestService("bo_referral");
const svcVenue = new RestService("bo_venue");
const svcUsage = new RestService("bo_referral_usage");

// State
const loading = ref(false);
const referrals = ref([]);
const venues = ref([]);
const filter = ref("all");
const searchQuery = ref("");
const showFormModal = ref(false);
const showUsageModal = ref(false);
const selectedReferral = ref(null);

// Get current user from localStorage
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
  }
  return null;
}

// Computed
const filteredReferrals = computed(() => {
  let result = referrals.value;

  // Filter by status
  if (filter.value === "active") {
    result = result.filter((r) => r.isactive && !isExpired(r.end_date));
  } else if (filter.value === "inactive") {
    result = result.filter((r) => !r.isactive);
  } else if (filter.value === "expired") {
    result = result.filter((r) => r.isactive && isExpired(r.end_date));
  }

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(
      (r) =>
        r.code.toLowerCase().includes(query) ||
        (r.description && r.description.toLowerCase().includes(query))
    );
  }

  return result;
});

const allCount = computed(() => referrals.value.length);
const activeCount = computed(
  () => referrals.value.filter((r) => r.isactive && !isExpired(r.end_date)).length
);
const inactiveCount = computed(
  () => referrals.value.filter((r) => !r.isactive).length
);
const expiredCount = computed(
  () => referrals.value.filter((r) => r.isactive && isExpired(r.end_date)).length
);

// Methods
onMounted(() => {
  loadReferrals();
  loadVenues();
});

async function loadReferrals() {
  loading.value = true;
  try {
    // Load semua referrals
    const result = await svc.listwhere(
      0, 
      1000, 
      [], 
      {col: 'created', ascending: false}
    );

    if (result.error) throw result.error;
    
    if (result.data && result.data.length > 0) {
      // Load venues
      const venueIds = [...new Set(result.data.map(r => r.bo_venue_id).filter(id => id))];
      const venues = {};
      
      if (venueIds.length > 0) {
        const venueWhere = [{ field: 'id', op: 'in', value: venueIds }];
        const venueResult = await svcVenue.listwhere(0, 250, venueWhere);
        if (venueResult.data) {
          venueResult.data.forEach(v => { venues[v.id] = v; });
        }
      }
      
      // Load ALL usage data sekali saja - lebih efisien seperti di modal!
      const usageResult = await svcUsage.listwhere(0, 10000, [], { col: 'used_at', ascending: false });
      
      // Group usage by referral_id
      const usageByReferral = {};
      if (usageResult.data && usageResult.data.length > 0) {
        usageResult.data.forEach(usage => {
          const refId = usage.bo_referral_id;
          if (!usageByReferral[refId]) {
            usageByReferral[refId] = [];
          }
          usageByReferral[refId].push(usage);
        });
      }
      
      // Map referrals dengan venue dan usage count
      referrals.value = result.data.map(r => ({
        ...r,
        bo_venue: r.bo_venue_id ? venues[r.bo_venue_id] : null,
        current_usage: usageByReferral[r.id] ? usageByReferral[r.id].length : 0
      }));
      
    } else {
      referrals.value = [];
    }
  } catch (error) {
    console.error("Error loading referrals:", error);
    alert("Error memuat data: " + error.message);
  } finally {
    loading.value = false;
  }
}

async function loadVenues() {
  try {
    const whereclause = [{ field: 'isactive', op: 'eq', value: true }];
    const result = await svcVenue.listwhere(0, 250, whereclause, {col: 'name', ascending: true});

    if (result.error) throw result.error;
    venues.value = result.data || [];
  } catch (error) {
    console.error("Error loading venues:", error);
  }
}

function openCreateModal() {
  selectedReferral.value = null;
  showFormModal.value = true;
}

function openEditModal(referral) {
  selectedReferral.value = { ...referral };
  showFormModal.value = true;
}

function closeFormModal() {
  showFormModal.value = false;
  selectedReferral.value = null;
}

function handleFormSuccess() {
  closeFormModal();
  loadReferrals();
}

function viewUsageDetail(referral) {
  selectedReferral.value = referral;
  showUsageModal.value = true;
}

// Handler saat modal usage ditutup - reload data
async function handleUsageModalClose() {
  showUsageModal.value = false;
  selectedReferral.value = null;
  // Reload untuk update usage count
  await loadReferrals();
}

async function toggleActive(referral) {
  const confirmMsg = referral.isactive
    ? `Nonaktifkan kode "${referral.code}"?`
    : `Aktifkan kembali kode "${referral.code}"?`;

  if (!confirm(confirmMsg)) return;

  try {
    const currentUser = getCurrentUser();
    const result = await svc.update(referral.id, {
      isactive: !referral.isactive,
      updated: new Date().toISOString(),
      updatedby: currentUser?.id || null,
    });

    if (result.error) throw result.error;
    await loadReferrals();
  } catch (error) {
    console.error("Error toggling active:", error);
    alert("Error mengubah status: " + error.message);
  }
}

async function deleteReferral(referral) {
  if (!confirm(`Hapus kode "${referral.code}"? Tindakan ini tidak dapat dibatalkan.`))
    return;

  try {
    const result = await svc.delete(referral.id);
    if (result.error) throw result.error;
    await loadReferrals();
  } catch (error) {
    console.error("Error deleting:", error);
    alert("Error menghapus data: " + error.message);
  }
}

async function handleAutoDeactivate() {
  if (!confirm("Nonaktifkan semua kode yang sudah expired?")) return;

  try {
    loading.value = true;
    const expiredRefs = referrals.value.filter((r) => r.isactive && isExpired(r.end_date));

    const currentUser = getCurrentUser();
    
    for (const ref of expiredRefs) {
      await svc.update(ref.id, {
        isactive: false,
        updated: new Date().toISOString(),
        updatedby: currentUser?.id || null,
      });
    }

    await loadReferrals();
    alert(`Berhasil menonaktifkan ${expiredRefs.length} kode yang expired.`);
  } catch (error) {
    console.error("Error auto-deactivating:", error);
    alert("Error: " + error.message);
  } finally {
    loading.value = false;
  }
}

const DAY_OPTIONS = [
  { label: 'Min', fullLabel: 'Minggu', value: 0 },
  { label: 'Sen', fullLabel: 'Senin', value: 1 },
  { label: 'Sel', fullLabel: 'Selasa', value: 2 },
  { label: 'Rab', fullLabel: 'Rabu', value: 3 },
  { label: 'Kam', fullLabel: 'Kamis', value: 4 },
  { label: 'Jum', fullLabel: "Jum'at", value: 5 },
  { label: 'Sab', fullLabel: 'Sabtu', value: 6 },
];

function parseDays(allowedDays) {
  if (!allowedDays) return [];
  return allowedDays.split(',').map(Number).filter(n => !isNaN(n)).sort((a,b) => a-b)
    .map(v => DAY_OPTIONS.find(d => d.value === v)).filter(Boolean);
}

function copyCode(code) {
  navigator.clipboard.writeText(code).then(
    () => {
      const temp = document.createElement('div');
      temp.textContent = 'Kode berhasil disalin!';
      temp.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 24px;border-radius:8px;z-index:99999;font-size:14px;font-weight:600;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
      document.body.appendChild(temp);
      setTimeout(() => temp.remove(), 2000);
    },
    (err) => {
      console.error('Could not copy code: ', err);
      alert('Gagal menyalin kode');
    }
  );
}

function getStatusClass(ref) {
  if (!ref.isactive) return "inactive";
  if (isExpired(ref.end_date)) return "expired";
  return "active";
}

function getStatusLabel(ref) {
  if (!ref.isactive) return "Nonaktif";
  if (isExpired(ref.end_date)) return "Expired";
  return "Aktif";
}

function isExpired(endDate) {
  if (!endDate) return false;
  return new Date(endDate) < new Date();
}

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(value) {
  if (!value) return "0";
  return new Intl.NumberFormat("id-ID").format(value);
}
</script>

<style scoped>
/* Icons */
.icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.icon-sm {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.icon-xs {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Layout */
.referral-page {
  padding: 1.5rem;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  gap: 1rem;
}

.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  color: #1a202c;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

/* Filter Tabs */
.filter-tabs {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.tab {
  padding: 0.75rem 1.25rem;
  border: none;
  background: white;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #64748b;
  border: 1px solid #e2e8f0;
  font-size: 0.9rem;
}

.tab:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.tab.active {
  background: #3b82f6;
  color: white;
  border-color: #3b82f6;
}

/* Search */
.search-box {
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  max-width: 400px;
  padding: 0.75rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 1rem;
  color: #64748b;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Desktop Table */
.desktop-view {
  display: block;
}

.mobile-view {
  display: none;
}

.table-container {
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid #e2e8f0;
}

.referral-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1200px;
}

.referral-table thead {
  background: #f8fafc;
}

.referral-table th {
  padding: 1rem 1.25rem;
  text-align: left;
  font-weight: 600;
  font-size: 0.85rem;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 2px solid #e2e8f0;
  white-space: nowrap;
}

.referral-table td {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
}

.referral-table tr:hover {
  background: #f8fafc;
}

.referral-table tr.inactive {
  opacity: 0.6;
  background: #fafafa;
}

/* Status Badge */
.status-badge {
  display: inline-block;
  padding: 0.35rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-badge.active {
  background: #dcfce7;
  color: #166534;
}

.status-badge.inactive {
  background: #f1f5f9;
  color: #64748b;
}

.status-badge.expired {
  background: #fef3c7;
  color: #92400e;
}

/* Code Cell */
.code-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.code-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.code {
  font-family: "Courier New", monospace;
  font-size: 0.95rem;
  color: #1e293b;
}

.btn-copy-code {
  padding: 0.25rem;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-copy-code:hover {
  background: #f1f5f9;
  color: #3b82f6;
}

.btn-copy-code:active {
  transform: translateY(0);
}

.description {
  color: #64748b;
  font-size: 0.85rem;
}

.discount-cell {
  font-weight: 600;
  color: #059669;
}

.max-discount {
  display: block;
  font-weight: 400;
  color: #64748b;
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.venue-name {
  color: #475569;
}

.date-range {
  font-size: 0.85rem;
  line-height: 1.6;
}

.badge-expired {
  display: inline-block;
  margin-top: 0.25rem;
  padding: 0.15rem 0.5rem;
  background: #f59e0b;
  color: white;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: 600;
}

.time-range {
  font-family: "Courier New", monospace;
  color: #475569;
}

.all-time {
  color: #94a3b8;
  font-style: italic;
}

/* Usage Cell */
.usage-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.usage-display {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  font-family: "Courier New", monospace;
  font-weight: 600;
  font-size: 0.95rem;
}

.usage-current {
  color: #3b82f6;
  font-size: 1rem;
}

.usage-separator {
  color: #94a3b8;
  font-weight: 400;
}

.usage-max {
  color: #64748b;
  font-size: 0.9rem;
}

.usage-mobile-display {
  display: inline-flex;
  align-items: baseline;
  gap: 0.25rem;
  font-family: "Courier New", monospace;
  font-weight: 600;
}

.usage-mobile-display .usage-current {
  color: #3b82f6;
}

.usage-mobile-display .usage-separator {
  color: #94a3b8;
  font-weight: 400;
}

.usage-mobile-display .usage-max {
  color: #64748b;
}

.btn-view-usage {
  padding: 0.4rem 0.5rem;
  background: #e0e7ff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-view-usage:hover {
  background: #c7d2fe;
  transform: scale(1.05);
}

.btn-view-usage:active {
  transform: scale(0.95);
}

.min-transaction {
  color: #475569;
  font-size: 0.85rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-icon {
  padding: 0.5rem;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-activate {
  background: #dcfce7;
  border-color: #86efac;
  color: #166534;
}

.btn-activate:hover {
  background: #bbf7d0;
}

.btn-deactivate {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.btn-deactivate:hover {
  background: #fecaca;
}

.btn-edit {
  background: #dbeafe;
  border-color: #93c5fd;
  color: #1e40af;
}

.btn-edit:hover {
  background: #bfdbfe;
}

.btn-delete {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.btn-delete:hover {
  background: #fecaca;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #94a3b8;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: #3b82f6;
  color: white;
}

.btn-primary:hover {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
}

.btn-secondary {
  background: #64748b;
  color: white;
}

.btn-secondary:hover {
  background: #475569;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(100, 116, 139, 0.3);
}

/* Mobile Card View */
.cards-container {
  display: grid;
  gap: 1rem;
}

.referral-card {
  background: white;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid #e2e8f0;
}

.referral-card.inactive {
  opacity: 0.6;
  background: #fafafa;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  gap: 0.5rem;
}

.card-title {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.card-description {
  color: #64748b;
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.card-info {
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
  min-width: 100px;
}

.info-value {
  color: #1e293b;
  text-align: right;
  flex: 1;
  word-break: break-word;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.discount-value {
  color: #059669;
  font-weight: 600;
}

.btn-view-usage-inline {
  display: inline-flex;
  padding: 0.25rem 0.4rem;
  background: #e0e7ff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-view-usage-inline:hover {
  background: #c7d2fe;
}

/* Responsive Styles */
@media (max-width: 1024px) {
  .referral-page {
    padding: 1rem;
  }

  .page-header h1 {
    font-size: 1.35rem;
  }

  .referral-table {
    min-width: 900px;
  }
}

@media (max-width: 768px) {
  .referral-page {
    padding: 0.75rem;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .page-header h1 {
    font-size: 1.25rem;
  }

  .header-actions {
    width: 100%;
  }

  .btn {
    flex: 1;
    padding: 0.65rem 1rem;
    font-size: 0.85rem;
  }

  .btn-text {
    display: inline;
  }

  .filter-tabs {
    gap: 0.5rem;
  }

  .tab {
    padding: 0.65rem 0.85rem;
    font-size: 0.85rem;
  }

  .search-input {
    max-width: 100%;
  }

  /* Hide desktop table, show mobile cards */
  .desktop-view {
    display: none;
  }

  .mobile-view {
    display: block;
  }
}

/* Day badges */
.days-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.day-badge {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #93c5fd;
  border-radius: 12px;
  font-size: 0.72rem;
  font-weight: 600;
  white-space: nowrap;
}

/* Discount apply-to badge */
.badge-apply {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  margin-top: 0.2rem;
  white-space: nowrap;
}

.badge-per-slot {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
}

.badge-total {
  background: #e0e7ff;
  color: #3730a3;
  border: 1px solid #c7d2fe;
}
</style>