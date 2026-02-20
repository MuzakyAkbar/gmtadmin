import { createRouter, createWebHistory } from "vue-router";
import AuthService from "../services/auth";
import Dashboard from "../views/Dashboard.vue";
import Login from "../views/auth/Login.vue";
import User from "../views/user/User.vue";
import Venue from "../views/venue/Venue.vue";
import Booking from "../views/booking/Booking.vue";
import Payment from "../views/payment/Payment.vue";
import Event from "../views/event/Event.vue";
import Schedule from "../views/schedule/Schedule.vue";
import Slot from "../views/slot/Slot.vue";
import Price from "../views/price/Price.vue";
import Referral from "../views/referral/Referral.vue";
import KategoriPendapatan from "../views/master/KategoriPendapatan.vue";
import KategoriOlahraga from "../views/master/KategoriOlahraga.vue";
import Reservation from "../views/reservation/Reservation.vue";

const routes = [
  {
    path: "/",
    name: "Dashboard",
    component: Dashboard,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/login",
    name: "Login",
    component: Login,
    meta: { layout: "AuthLayout" },
  },
  {
    path: "/schedule",
    name: "Schedule",
    component: Schedule,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/booking",
    name: "Order",
    component: Booking,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/reservation",
    name: "Reservation",
    component: Reservation,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/payment",
    name: "Payment",
    component: Payment,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/customer",
    name: "Customer",
    component: User,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/event",
    name: "Event",
    component: Event,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/venue",
    name: "Venue",
    component: Venue,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/slot",
    name: "Slot Booking",
    component: Slot,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/price",
    name: "Price",
    component: Price,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/referral",
    name: "Referral",
    component: Referral,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/master/kategori-pendapatan",
    name: "Kategori Pendapatan",
    component: KategoriPendapatan,
    meta: { layout: "DefaultLayout" },
  },
  {
    path: "/master/kategori-olahraga",
    name: "Kategori Olahraga",
    component: KategoriOlahraga,
    meta: { layout: "DefaultLayout" },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from) => {
  const authsvc = new AuthService();

  const s = await authsvc.getSession();

  let loggedin = s.session;
  if (s.isexpired) {
    loggedin = false;
  }

  if (!loggedin && to.name !== "Login") {
    return { name: "Login" };
  }

  if (loggedin && to.name === "Login") {
    return { name: "Dashboard" };
  }
});

export default router;