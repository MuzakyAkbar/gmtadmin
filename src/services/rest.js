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

  getById(id) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    return supabase.from(this.objectname).select().eq("id", id).maybeSingle();
  }

  list(from, to, sort) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    if (!from) from = 0;
    if (!to) to = 25;
    if (!sort) sort = [{ col: "created", asc: false }];
    return supabase
      .from(this.objectname)
      .select()
      .eq("isactive", true)
      .range(from, to)
      .order(sort[0].col, { ascending: sort[0].asc });
  }

  listfilter(filter, from, to) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    if (!from) from = 0;
    if (!to) to = 25;
    return supabase
      .from(this.objectname)
      .select()
      .eq("isactive", true)
      .eq(filter.key, filter.value)
      .range(from, to);
  }

  listwhere(from, to, where, sort) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    if (!from) from = 0;
    if (!to) to = 250;

    let query = supabase.from(this.objectname).select().range(from, to);

    if (where && Array.isArray(where)) {
      for (const w of where) {
        if (w.op === 'eq')        query = query.eq(w.field, w.value);
        else if (w.op === 'neq')  query = query.neq(w.field, w.value);
        else if (w.op === 'gte')  query = query.gte(w.field, w.value);
        else if (w.op === 'lte')  query = query.lte(w.field, w.value);
        else if (w.op === 'gt')   query = query.gt(w.field, w.value);
        else if (w.op === 'lt')   query = query.lt(w.field, w.value);
        else if (w.op === 'in')   query = query.in(w.field, w.value);
        else if (w.op === 'like') query = query.ilike(w.field, `%${w.value}%`);
      }
    }

    if (sort) query = query.order(sort.col, { ascending: sort.asc });

    return query;
  }

  add(data) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    
    console.log(`🔧 [RestService] Adding to ${this.objectname}:`, data);
    
    return supabase
      .from(this.objectname)
      .insert(data)
      .select()
      .then(result => {
        if (result.error) {
          console.error(`❌ [RestService] Insert error for ${this.objectname}:`, result.error);
        } else {
          console.log(`✅ [RestService] Successfully inserted to ${this.objectname}:`, result.data);
        }
        return result;
      });
  }
  
  update(id, data) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    
    console.log(`🔧 [RestService] Updating ${this.objectname} (${id}):`, data);
    
    return supabase
      .from(this.objectname)
      .update(data)
      .eq("id", id)
      .select()
      .then(result => {
        if (result.error) {
          console.error(`❌ [RestService] Update error for ${this.objectname}:`, result.error);
        } else {
          console.log(`✅ [RestService] Successfully updated ${this.objectname}:`, result.data);
        }
        return result;
      });
  }
  
  delete(id) {
    if (!this.objectname) {
      throw new Error("Object name is not set");
    }
    return supabase.from(this.objectname).delete().eq("id", id);
  }
}