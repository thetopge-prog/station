/**
 * Hand-written Supabase schema contract for the cafe DB. Kept in sync with the
 * migrations under supabase/migrations. Cost columns exist in the type (the
 * service-role client reads them) but are revoked from anon/authenticated at the
 * database — the grant, not the type, is the security boundary.
 *
 * When the schema grows, regenerate with `supabase gen types` or extend by hand.
 */

export type OrderChannel = "qr" | "kiosk" | "cashier" | "delivery" | "pickup" | "curbside";
/** kitchen state - deliberately separate from OrderStatus, which is money */
export type PrepStatus = "new" | "preparing" | "ready" | "handed";
export type PrinterKind = "receipt" | "station" | "expediter";
export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";
export type VariantKind = "size" | "flavor";

type Timestamped = { id: string; created_at: string };

export type Database = {
  public: {
    Tables: {
      roles: {
        Row: Timestamped & { name_ar: string; name_en: string };
        Insert: { id?: string; name_ar: string; name_en: string; created_at?: string };
        Update: Partial<{ name_ar: string; name_en: string }>;
        Relationships: [];
      };
      employees: {
        Row: Timestamped & {
          name_ar: string; role_id: string | null; auth_user_id: string | null; is_active: boolean;
          wage_amount: number; wage_period: "daily" | "weekly" | "monthly" | null; station_id: string | null;
          is_developer: boolean;  // 0046 — sees /setup; set in the database, not the UI
        };
        Insert: {
          id?: string; name_ar: string; role_id?: string | null; auth_user_id?: string | null; is_active?: boolean;
          wage_amount?: number; wage_period?: "daily" | "weekly" | "monthly" | null; station_id?: string | null; created_at?: string;
          is_developer?: boolean;
        };
        Update: Partial<{
          name_ar: string; role_id: string | null; auth_user_id: string | null; is_active: boolean;
          wage_amount: number; wage_period: "daily" | "weekly" | "monthly" | null; station_id: string | null;
          is_developer: boolean;
        }>;
        Relationships: [];
      };
      categories: {
        Row: Timestamped & { name_ar: string; image_url: string | null; sort: number; is_active: boolean; station_id: string | null };
        Insert: { id?: string; name_ar: string; image_url?: string | null; sort?: number; is_active?: boolean; station_id?: string | null; created_at?: string };
        Update: Partial<{ name_ar: string; image_url: string | null; sort: number; is_active: boolean; station_id: string | null }>;
        Relationships: [];
      };
      menu_items: {
        Row: Timestamped & {
          category_id: string; name_ar: string; description_ar: string | null; image_url: string | null;
          price: number; cost: number; flavors: string[]; is_active: boolean; sort: number;
        };
        Insert: {
          id?: string; category_id: string; name_ar: string; description_ar?: string | null; image_url?: string | null;
          price?: number; cost?: number; flavors?: string[]; is_active?: boolean; sort?: number; created_at?: string;
        };
        Update: Partial<{
          category_id: string; name_ar: string; description_ar: string | null; image_url: string | null;
          price: number; cost: number; flavors: string[]; is_active: boolean; sort: number;
        }>;
        Relationships: [];
      };
      item_variants: {
        Row: Timestamped & {
          item_id: string; kind: VariantKind; name_ar: string;
          price_override: number | null; cost_override: number | null; is_active: boolean; sort: number;
        };
        Insert: {
          id?: string; item_id: string; kind?: VariantKind; name_ar: string;
          price_override?: number | null; cost_override?: number | null; is_active?: boolean; sort?: number; created_at?: string;
        };
        Update: Partial<{
          item_id: string; kind: VariantKind; name_ar: string;
          price_override: number | null; cost_override: number | null; is_active: boolean; sort: number;
        }>;
        Relationships: [];
      };
      customers: {
        // address (0047): the last known delivery address, kept on the PERSON so
        // a regular is never asked where they live twice
        Row: Timestamped & { card_serial: string; phone: string | null; name_ar: string | null; points: number; address: string | null };
        Insert: { id?: string; card_serial?: string; phone?: string | null; name_ar?: string | null; points?: number; address?: string | null; created_at?: string };
        Update: Partial<{ phone: string | null; name_ar: string | null; points: number; address: string | null }>;
        Relationships: [];
      };
      // 0047 — a phone rings, the number lands here, the till says who it is
      incoming_calls: {
        Row: { id: string; phone: string; customer_id: string | null; handled_at: string | null; created_at: string; caller_name: string | null };
        Insert: { id?: string; phone: string; customer_id?: string | null; handled_at?: string | null; created_at?: string; caller_name?: string | null };
        Update: Partial<{ customer_id: string | null; handled_at: string | null }>;
        Relationships: [];
      };
      debt_entries: {
        Row: Timestamped & { session_id: string | null; customer_name: string; phone: string | null; kind: "debit" | "credit"; amount: number; note: string | null; created_by: string | null; business_day: string };
        Insert: { id?: string; customer_name: string; phone?: string | null; kind: "debit" | "credit"; amount: number; note?: string | null; created_by?: string | null; business_day?: string; created_at?: string ; session_id?: string | null };
        Update: Partial<{ customer_name: string; phone: string | null; note: string | null }>;
        Relationships: [];
      };
      delivery_partners: {
        Row: Timestamped & { name_ar: string; phone: string | null; is_active: boolean; sort: number; note: string | null };
        Insert: { id?: string; name_ar: string; phone?: string | null; is_active?: boolean; sort?: number; note?: string | null; created_at?: string };
        Update: Partial<{ name_ar: string; phone: string | null; is_active: boolean; sort: number; note: string | null }>;
        Relationships: [];
      };
      partner_settlements: {
        Row: Timestamped & { partner_id: string; amount: number; method: "cash" | "transfer" | "other"; note: string | null; created_by: string | null; business_day: string };
        Insert: { id?: string; partner_id: string; amount: number; method?: "cash" | "transfer" | "other"; note?: string | null; created_by?: string | null; business_day?: string; created_at?: string };
        Update: Partial<{ amount: number; method: "cash" | "transfer" | "other"; note: string | null }>;
        Relationships: [];
      };
      daily_resets: {
        Row: Timestamped & { reset_at: string; by_employee: string | null };
        Insert: { id?: string; reset_at?: string; by_employee?: string | null; created_at?: string };
        Update: Partial<{ reset_at: string; by_employee: string | null }>;
        Relationships: [];
      };
      item_offers: {
        Row: Timestamped & { item_id: string; offer_price: number; business_day: string; note: string | null };
        Insert: { id?: string; item_id: string; offer_price: number; business_day?: string; note?: string | null; created_at?: string };
        Update: Partial<{ offer_price: number; note: string | null }>;
        Relationships: [];
      };
      offers: {
        Row: Timestamped & { title: string; description: string | null; active: boolean; auto: boolean; batch_id: string | null; ends_on: string | null };
        Insert: { id?: string; title: string; description?: string | null; active?: boolean; auto?: boolean; batch_id?: string | null; ends_on?: string | null; created_at?: string };
        Update: Partial<{ title: string; description: string | null; active: boolean; ends_on: string | null }>;
        Relationships: [];
      };
      cafe_tables: {
        Row: {
          name: string; kind: string; active: boolean; pos_x: number; pos_y: number; sort: number; updated_at: string;
          clean_status: "clean" | "dirty"; cleaned_at: string | null; cleaned_by: string | null;
        };
        Insert: {
          name: string; kind?: string; active?: boolean; pos_x?: number; pos_y?: number; sort?: number; updated_at?: string;
          clean_status?: "clean" | "dirty"; cleaned_at?: string | null; cleaned_by?: string | null;
        };
        Update: Partial<{
          kind: string; active: boolean; pos_x: number; pos_y: number; sort: number; updated_at: string;
          clean_status: "clean" | "dirty"; cleaned_at: string | null; cleaned_by: string | null;
        }>;
        Relationships: [];
      };
      monthly_costs: {
        Row: { category: string; amount: number; updated_at: string };
        Insert: { category: string; amount?: number; updated_at?: string };
        Update: Partial<{ amount: number; updated_at: string }>;
        Relationships: [];
      };
      register_closures: {
        Row: { business_day: string; remaining: number; note: string | null; closed_by: string | null; created_at: string; updated_at: string };
        Insert: { business_day: string; remaining: number; note?: string | null; closed_by?: string | null; created_at?: string; updated_at?: string };
        Update: Partial<{ remaining: number; note: string | null; closed_by: string | null; updated_at: string }>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: Timestamped & { endpoint: string; p256dh: string; auth: string };
        Insert: { id?: string; endpoint: string; p256dh: string; auth: string; created_at?: string };
        Update: Partial<{ endpoint: string; p256dh: string; auth: string }>;
        Relationships: [];
      };
      ingredients: {
        Row: Timestamped & {
          name_ar: string; unit: string; category: string | null; min_qty: number;
          default_shelf_days: number | null; is_active: boolean; sort: number;
        };
        Insert: {
          id?: string; name_ar: string; unit: string; category?: string | null; min_qty?: number;
          default_shelf_days?: number | null; is_active?: boolean; sort?: number;
        };
        Update: Partial<{
          name_ar: string; unit: string; category: string | null; min_qty: number;
          default_shelf_days: number | null; is_active: boolean; sort: number;
        }>;
        Relationships: [];
      };
      inventory_batches: {
        Row: Timestamped & {
          ingredient_id: string; qty_received: number; qty_remaining: number; unit_cost: number;
          received_on: string; expiry_date: string | null; supplier: string | null; note: string | null;
          created_by: string | null;
        };
        Insert: { id?: string; ingredient_id: string; qty_received: number; qty_remaining: number; unit_cost?: number };
        Update: Partial<{ qty_remaining: number; expiry_date: string | null }>;
        Relationships: [];
      };
      stock_movements: {
        Row: Timestamped & {
          ingredient_id: string; batch_id: string | null; delta: number; reason: string;
          note: string | null; business_day: string; created_by: string | null;
        };
        Insert: { id?: string; ingredient_id: string; delta: number; reason: string };
        Update: Partial<{ note: string | null }>;
        Relationships: [];
      };
      recipe_lines: {
        Row: { item_id: string; ingredient_id: string; qty: number };
        Insert: { item_id: string; ingredient_id: string; qty: number };
        Update: Partial<{ qty: number }>;
        Relationships: [];
      };
      purchase_orders: {
        Row: Timestamped & { business_day: string; status: string; note: string | null; created_by: string | null };
        Insert: { id?: string; status?: string; note?: string | null };
        Update: Partial<{ status: string; note: string | null }>;
        Relationships: [];
      };
      purchase_order_lines: {
        Row: { id: string; po_id: string; ingredient_id: string; on_hand: number; min_qty: number; qty: number; est_unit_cost: number };
        Insert: { po_id: string; ingredient_id: string; qty: number };
        Update: Partial<{ qty: number }>;
        Relationships: [];
      };
      cashier_sessions: {
        Row: Timestamped & {
          business_day: string; cashier_id: string; opened_at: string; opening_float: number;
          opened_from: string | null; closed_at: string | null; counted_cash: number | null;
          deposited: number; expected_cash: number | null; variance: number | null;
          close_note: string | null; handover_to: string | null; handover_amount: number | null;
          handover_confirmed_at: string | null; handover_counted: number | null;
        };
        Insert: { id?: string; cashier_id: string; opening_float?: number; opened_from?: string | null };
        Update: Partial<{ closed_at: string | null; counted_cash: number | null; deposited: number }>;
        Relationships: [];
      };
      shifts: {
        Row: Timestamped & {
          business_day: string; role: "cashier" | "expediter" | "chef" | "cleaner";
          employee_id: string; station_id: string | null;
          opened_at: string; closed_at: string | null; opened_by: string | null;
        };
        Insert: {
          id?: string; business_day?: string; role: "cashier" | "expediter" | "chef" | "cleaner";
          employee_id: string; station_id?: string | null;
          opened_at?: string; closed_at?: string | null; opened_by?: string | null; created_at?: string;
        };
        Update: Partial<{ closed_at: string | null; station_id: string | null }>;
        Relationships: [];
      };
      // آخر ما وصل إلى /api/calls — لصفحة التركيب (0052)
      webhook_log: {
        Row: { id: number; at: string; route: string; status: number; body: string | null; note: string | null };
        Insert: { route: string; status: number; body?: string | null; note?: string | null };
        Update: Partial<{ route: string; status: number; body: string | null; note: string | null }>;
        Relationships: [];
      };
      // من كان يجهّز في يوم عمل — يؤشّرهم الكاشير (0050)
      duty_expediters: {
        Row: { business_day: string; employee_id: string; created_at: string };
        Insert: { business_day: string; employee_id: string; created_at?: string };
        Update: Partial<{ business_day: string; employee_id: string }>;
        Relationships: [];
      };
      display_ads: {
        Row: Timestamped & { title: string | null; image_url: string; duration_s: number; sort: number; is_active: boolean };
        Insert: { id?: string; title?: string | null; image_url: string; duration_s?: number; sort?: number; is_active?: boolean; created_at?: string };
        Update: Partial<{ title: string | null; image_url: string; duration_s: number; sort: number; is_active: boolean }>;
        Relationships: [];
      };
      stations: {
        Row: Timestamped & { name_ar: string; name_en: string; sort: number; is_active: boolean };
        Insert: { id?: string; name_ar: string; name_en: string; sort?: number; is_active?: boolean; created_at?: string };
        Update: Partial<{ name_ar: string; name_en: string; sort: number; is_active: boolean }>;
        Relationships: [];
      };
      printers: {
        Row: Timestamped & {
          name_ar: string; kind: PrinterKind; station_id: string | null;
          host: string | null; port: number; share: string | null;
          codepage: "cp1256" | "utf8"; codepage_cmd: number | null; copies: number; is_active: boolean; sort: number; updated_at: string;
        };
        Insert: {
          id?: string; name_ar: string; kind: PrinterKind; station_id?: string | null;
          host?: string | null; port?: number; share?: string | null;
          codepage?: "cp1256" | "utf8"; codepage_cmd?: number | null; copies?: number; is_active?: boolean; sort?: number;
          updated_at?: string; created_at?: string;
        };
        Update: Partial<{
          name_ar: string; kind: PrinterKind; station_id: string | null;
          host: string | null; port: number; share: string | null;
          codepage: "cp1256" | "utf8"; codepage_cmd: number | null; copies: number; is_active: boolean; sort: number; updated_at: string;
        }>;
        Relationships: [];
      };
      order_counters_remote: {
        Row: { business_day: string; last_seq: number };
        Insert: { business_day: string; last_seq?: number };
        Update: Partial<{ last_seq: number }>;
        Relationships: [];
      };
      order_counters: {
        Row: { business_day: string; last_seq: number };
        Insert: { business_day: string; last_seq?: number };
        Update: Partial<{ last_seq: number }>;
        Relationships: [];
      };
      orders: {
        Row: Timestamped & {
          business_day: string; order_seq: number; channel: OrderChannel; status: OrderStatus;
          subtotal: number; cost_total: number; discount: number; extra: number; extra_note: string | null;
          table_no: string | null; note: string | null;
          customer_id: string | null; cashier_id: string | null; paid_at: string | null; shortage_ack_at: string | null;
          prep_status: PrepStatus; expediter_id: string | null; pickup_code: string | null;
          eta_minutes: number | null; customer_phone: string | null; address_note: string | null;
          updated_at: string; source: "hub" | "cloud";
          order_source: "pos" | "web" | "whatsapp"; customer_name: string | null; notified_at: string | null;
          payment_method: "cash" | "card" | "partner" | null; session_id: string | null; partner_id: string | null;
        };
        Insert: {
          id?: string; business_day?: string; order_seq: number; channel: OrderChannel; status?: OrderStatus;
          subtotal?: number; cost_total?: number; discount?: number; extra?: number; extra_note?: string | null;
          table_no?: string | null; note?: string | null;
          customer_id?: string | null; cashier_id?: string | null; paid_at?: string | null; created_at?: string;
          prep_status?: PrepStatus; expediter_id?: string | null; pickup_code?: string | null;
          eta_minutes?: number | null; customer_phone?: string | null; address_note?: string | null;
          updated_at?: string; source?: "hub" | "cloud";
          order_source?: "pos" | "web" | "whatsapp"; customer_name?: string | null; notified_at?: string | null;
          payment_method?: "cash" | "card" | "partner" | null; session_id?: string | null; partner_id?: string | null;
        };
        Update: Partial<{
          status: OrderStatus; discount: number; extra: number; extra_note: string | null;
          customer_id: string | null; paid_at: string | null; shortage_ack_at: string | null;
          prep_status: PrepStatus; expediter_id: string | null; eta_minutes: number | null; updated_at: string; payment_method: "cash" | "card" | "partner" | null; session_id: string | null; partner_id: string | null;
        }>;
        Relationships: [];
      };
      order_items: {
        Row: Timestamped & {
          order_id: string; item_id: string | null; variant_id: string | null; name_ar: string; flavor_ar: string | null;
          qty: number; unit_price: number; unit_cost: number; unavailable_at: string | null; line_total: number;
        };
        Insert: {
          id?: string; order_id: string; item_id?: string | null; variant_id?: string | null; name_ar: string; flavor_ar?: string | null;
          qty: number; unit_price: number; unit_cost?: number; unavailable_at?: string | null; created_at?: string;
        };
        Update: Partial<{ qty: number; unit_price: number }>;
        Relationships: [];
      };
      expenses: {
        Row: Timestamped & { session_id: string | null; business_day: string; amount: number; category: string | null; note: string | null; created_by: string | null };
        Insert: { id?: string; business_day?: string; amount: number; category?: string | null; note?: string | null; created_by?: string | null; created_at?: string; session_id?: string | null };
        Update: Partial<{ business_day: string; amount: number; category: string | null; note: string | null }>;
        Relationships: [];
      };
      loyalty_events: {
        Row: Timestamped & {
          customer_id: string; delta: number; reason: string; order_id: string | null; idempotency_key: string | null; created_by: string | null;
        };
        Insert: {
          id?: string; customer_id: string; delta: number; reason: string; order_id?: string | null; idempotency_key?: string | null; created_by?: string | null; created_at?: string;
        };
        Update: Partial<{ delta: number; reason: string }>;
        Relationships: [];
      };
    };
    Views: {
      menu_public: {
        Row: {
          id: string; category_id: string; name_ar: string; description_ar: string | null; image_url: string | null;
          price: number; flavors: string[]; sort: number;
          category_name: string; category_image: string | null; category_sort: number;
        };
        Relationships: [];
      };
      variant_public: {
        Row: { id: string; item_id: string; kind: VariantKind; name_ar: string; price: number; sort: number };
        Relationships: [];
      };
      active_offers: {
        Row: { id: string; title: string; description: string | null };
        Relationships: [];
      };
      active_item_offers: {
        Row: { item_id: string; offer_price: number };
        Relationships: [];
      };
      queue_public: {
        Row: {
          id: string; order_seq: number; pickup_code: string | null; prep_status: "preparing" | "ready";
          table_no: string | null; channel: OrderChannel; created_at: string; updated_at: string;
          eta_minutes: number | null; cashier_name: string | null; expediter_name: string | null;
        };
        Relationships: [];
      };
      menu_margins: {
        Row: {
          id: string; name_ar: string; category_name: string; price: number; cost: number;
          margin: number; margin_pct: number; expiry_pressure: number | null;
        };
        Relationships: [];
      };
      stock_status: {
        Row: {
          id: string; name_ar: string; unit: string; category: string | null; min_qty: number;
          on_hand: number; avg_unit_cost: number; nearest_expiry: string | null;
          stock_state: "ok" | "low" | "out";
        };
        Relationships: [];
      };
      active_shifts: {
        Row: {
          id: string; role: "cashier" | "expediter" | "chef" | "cleaner";
          employee_id: string; station_id: string | null; opened_at: string;
          employee_name: string; station_name: string | null;
        };
        Relationships: [];
      };
      partner_balances: {
        Row: {
          id: string; name_ar: string; is_active: boolean; phone: string | null;
          billed: number; settled: number; balance: number; orders_count: number;
          last_order_at: string | null; last_settled_at: string | null;
        };
        Relationships: [];
      };
      debtor_balances: {
        Row: { customer_name: string; phone: string | null; total_debt: number; total_paid: number; balance: number; last_activity: string };
        Relationships: [];
      };
    };
    Functions: {
      // يستبدل قائمة مجهّزي اليوم كاملة (0050)
      set_duty_expediters: { Args: { p_day: string; p_ids: string[] }; Returns: undefined };
      log_webhook: { Args: { p_route: string; p_status: number; p_body: string; p_note: string }; Returns: undefined };
      place_order: {
        Args: {
          p_channel: OrderChannel; p_lines: Json; p_customer?: string | null; p_table?: string | null;
          p_note?: string | null; p_phone?: string | null; p_address?: string | null;
          p_source?: "pos" | "web" | "whatsapp"; p_customer_name?: string | null;
        };
        Returns: { order_id: string; order_seq: number; pickup_code: string | null; table_no: string | null }[];
      };
      mark_order_paid: {
        Args: { p_order: string; p_discount?: number; p_customer?: string | null; p_award_points?: number; p_extra?: number; p_extra_note?: string | null };
        Returns: number;
      };
      cancel_order: { Args: { p_order: string }; Returns: undefined };
      // 0049 — an item ran out mid-assembly: drop it, re-total, alert the till
      mark_item_unavailable: {
        Args: { p_item: string };
        Returns: {
          order_id: string; order_seq: number; item_name: string;
          customer_phone: string | null; customer_name: string | null;
          new_total: number; refund_due: number;
        }[];
      };
      ack_shortage: { Args: { p_order: string }; Returns: undefined };
      // 0045 — delivery aggregators billed postpaid
      save_partner: {
        Args: { p_id: string | null; p_name: string; p_phone?: string | null; p_active?: boolean; p_note?: string | null };
        Returns: string;
      };
      settle_partner: {
        Args: { p_partner: string; p_amount: number; p_method?: "cash" | "transfer" | "other"; p_note?: string | null };
        Returns: number;
      };
      partner_ledger: {
        Args: { p_partner: string; p_from?: string | null; p_to?: string | null };
        Returns: { kind: "order" | "settlement"; ref: string; at: string; label: string; amount: number }[];
      };
      partner_order_items: {
        Args: { p_order: string };
        Returns: { name_ar: string; flavor_ar: string | null; qty: number; line_total: number }[];
      };
      // 0044 — the Station Hub replaying what it took while the line was down.
      // Service role only: these write an order with an id and a number of the
      // caller's choosing, which no browser session may ever do.
      sync_hub_order: {
        Args: {
          p_id: string; p_seq: number; p_day: string; p_channel: OrderChannel; p_lines: Json;
          p_created: string; p_table?: string | null; p_note?: string | null; p_phone?: string | null;
          p_address?: string | null; p_customer_name?: string | null; p_code?: string | null;
          p_cashier?: string | null; p_expediter?: string | null; p_prep_status?: PrepStatus;
        };
        Returns: { order_id: string; order_seq: number; already: boolean }[];
      };
      sync_hub_prep: { Args: { p_id: string; p_status: PrepStatus; p_at: string }; Returns: boolean };
      set_prep_status: { Args: { p_order: string; p_status: PrepStatus }; Returns: undefined };
      claim_expediter: { Args: { p_order: string }; Returns: undefined };
      mark_ready: { Args: { p_order: string }; Returns: undefined };
      mark_notified: { Args: { p_order: string }; Returns: undefined };
      my_open_session: { Args: Record<string, never>; Returns: string | null };
      receive_stock: {
        Args: { p_ingredient: string; p_qty: number; p_unit_cost?: number; p_expiry?: string | null; p_supplier?: string | null; p_note?: string | null };
        Returns: string;
      };
      consume_stock: {
        Args: { p_ingredient: string; p_qty: number; p_reason?: string; p_note?: string | null };
        Returns: number;
      };
      generate_shortage_po: { Args: { p_note?: string | null }; Returns: string | null };
      daily_fixed_cost: {
        Args: Record<string, never>;
        Returns: { rent_share: number; wages_share: number; total: number; configured: boolean }[];
      };
      bep_today: {
        Args: Record<string, never>;
        Returns: {
          fixed_cost: number; revenue: number; cogs: number; gross_profit: number;
          remaining: number; met: boolean; configured: boolean; orders_count: number;
        }[];
      };
      chef_picks: {
        Args: { p_limit?: number };
        Returns: { id: string; name_ar: string; category_name: string; price: number }[];
      };
      recommended_items: {
        Args: { p_limit?: number };
        Returns: {
          id: string; name_ar: string; category_name: string; price: number;
          margin: number; margin_pct: number; expiry_pressure: number | null; reason: string;
        }[];
      };
      open_cashier_session: {
        Args: { p_float: number; p_from_session?: string | null; p_counted?: number | null };
        Returns: string;
      };
      close_cashier_session: {
        Args: { p_session: string; p_counted: number; p_deposited?: number; p_handover_to?: string | null; p_note?: string | null };
        Returns: { expected_cash: number; variance: number }[];
      };
      session_report: {
        Args: { p_session: string };
        Returns: {
          opening_float: number; cash_sales: number; card_sales: number; orders_count: number;
          expenses_total: number; deposited: number; debts_issued: number; expected_cash: number;
        }[];
      };
      pending_handover: {
        Args: Record<string, never>;
        Returns: { session_id: string; from_name: string; amount: number; closed_at: string }[];
      };
      busy_tables: { Args: Record<string, never>; Returns: string[] };
      confirm_assembled: {
        Args: { p_order: string };
        Returns: { order_seq: number; pickup_code: string | null; expediter_name: string | null }[];
      };
      open_shift: {
        Args: { p_role: string; p_employee: string; p_station?: string | null; p_exclusive?: boolean };
        Returns: string;
      };
      close_shift: { Args: { p_shift: string }; Returns: undefined };
      current_expediter: { Args: { p_station?: string | null }; Returns: string | null };
      mark_table_clean: { Args: { p_name: string }; Returns: undefined };
      mark_table_dirty: { Args: { p_name: string }; Returns: undefined };
      refund_order: { Args: { p_order: string }; Returns: undefined };
      get_card: { Args: { p_serial: string }; Returns: { id: string; name_ar: string | null; points: number }[] };
      create_card: { Args: { p_phone: string | null; p_name: string | null }; Returns: string };
      adjust_points: { Args: { p_customer: string; p_delta: number; p_reason: string; p_key?: string | null }; Returns: number };
      redeem_points: { Args: { p_customer: string; p_cost: number; p_key: string }; Returns: number };
      get_orders_public: { Args: { p_orders: string[] }; Returns: Json };
      save_cafe_tables: { Args: { p_tables: Json }; Returns: undefined };
      guest_estimate: { Args: { p_from: string; p_to: string }; Returns: number };
      range_summary: {
        Args: { p_from: string; p_to: string };
        Returns: { day: string; sales: number; orders_count: number; profit: number; expenses: number; net: number }[];
      };
    };
    Enums: {
      order_channel: OrderChannel;
      order_status: OrderStatus;
      variant_kind: VariantKind;
      prep_status: PrepStatus;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
