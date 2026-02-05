import { supabase } from "../plugins/supabaseClient";

export default class AuthService {
  login(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  logout() {
    return supabase.auth.signOut();
  }

  getUserProfile(uid) {
    return supabase.from("bo_user").select().eq("uid", uid).limit(1).single();
  }

  getSession() {
    return new Promise((resolve, reject) => {
      supabase.auth
        .getSession()
        .then((d) => {
          // console.log(d);
          if (d.data.session) {
            if (d.data.session.expires_at < Math.floor(Date.now() / 1000)) {
              d.data.isexpired = true;
            }
            resolve(d.data);
          } else {
            d.data.isexpired = true;
            resolve(d.data);
          }
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  refreshSession() {
    return supabase.refreshSession();
  }
}
