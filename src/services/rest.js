import { ascending } from "ol/array";
import { supabase } from "../plugins/supabaseClient";

export default class RestService {
  constructor(objectname) {
    if (!objectname) {
      throw new Error("Object Name required!");
    }
    this.objectname = objectname;
  }

  setObjectName(objectname) {
    this.objectname = objectname;
  }

  listref(from, to) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    if (!from) from = 0;
    if (!to) to = 25;
    return supabase
      .from(this.objectname)
      .select()
      .eq("isactive", true)
      .range(from, to);
  }

  list(from, to, sortby) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    if (!from) from = 0;
    if (!to) to = 250;
    if (!sortby) sortby = { col: "created", asc: { ascending: false } };
    return supabase
      .from(this.objectname)
      .select(`*`, { count: "exact" })
      .range(from, to)
      .order(sortby.col, sortby.asc);
  }

  add(data) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    return supabase.from(this.objectname).insert(data);
  }
  update(id, data) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    return supabase.from(this.objectname).update(data).eq("id", id);
  }
  delete(id) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    return supabase.from(this.objectname).delete().eq("id", id);
  }
}
