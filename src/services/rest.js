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

  listwhere(from = 0, limit = 250, whereclause = [], sortby) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }

    const to = from + limit - 1;

    if (!sortby) {
      sortby = { col: "created", ascending: false };
    }

    let query = supabase
      .from(this.objectname)
      .select("*", { count: "exact" })
      .range(from, to)
      .order(sortby.col, { ascending: sortby.ascending });

    for (const clause of whereclause) {
      switch (clause.op) {
        case "eq":
          query = query.eq(clause.field, clause.value);
          break;
        case "neq":
          query = query.neq(clause.field, clause.value);
          break;
        case "gt":
          query = query.gt(clause.field, clause.value);
          break;
        case "gte":
          query = query.gte(clause.field, clause.value);
          break;
        case "lt":
          query = query.lt(clause.field, clause.value);
          break;
        case "lte":
          query = query.lte(clause.field, clause.value);
          break;
        case "like":
          query = query.like(clause.field, `%${clause.value}%`);
          break;
        case "ilike":
          query = query.ilike(clause.field, `%${clause.value}%`);
          break;
        case "in":
          query = query.in(clause.field, clause.value); // array
          break;
        case "is":
          query = query.is(clause.field, clause.value); // null / true / false
          break;
        default:
          query = query.eq(clause.field, clause.value);
      }
    }

    return query;
  }

  add(data) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    return supabase.from(this.objectname).insert(data).select();
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
