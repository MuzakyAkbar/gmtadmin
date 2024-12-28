import { createRouter, createWebHistory } from "vue-router";
import Dashboard from "../views/Dashboard.vue";
import Login from "../views/auth/Login.vue";
import AuthService from "../services/auth";

const routes = [
  {
    path: "/",
    name: "Dashboard",
    component: Dashboard,
    meta: { layout: "DefaultLayout" }, // Use DefaultLayout
  },
  {
    path: "/login",
    name: "Login",
    component: Login,
    meta: { layout: "AuthLayout" }, // Use AuthLayout
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
  // console.log(loggedin);

  if (!loggedin && to.name !== "Login") {
    return { name: "Login" };
  }

  if (loggedin && to.name === "Login") {
    return { name: "Dashboard" };
  }
});

export default router;
