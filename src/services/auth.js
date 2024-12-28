import axios from "axios";
import { supabase } from "../plugins/supabaseClient";

export default class AuthService {
  login(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  logout() {
    return supabase.auth.signOut();
  }

  // async getSssion() {
  //   let e = await supabase.auth.getSession();
  //   return e ? e.data : null;
  // }

  getSession() {
    return new Promise((resolve, reject) => {
      supabase.auth
        .getSession()
        .then((d) => {
          // console.log(d);
          if (d.data) {
            if (d.data.session.expires_at < Math.floor(Date.now() / 1000)) {
              d.data.isexpired = true;
            }
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
