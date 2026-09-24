// Auto-generated from Supabase — regenerate with
// mcp__Supabase__generate_typescript_types after each migration. Do not
// hand-edit; add hand-written helpers in domain.ts instead.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          id: string
          org_id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          id?: string
          org_id: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          code: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          parent_account_id: string | null
          subtype: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          parent_account_id?: string | null
          subtype?: string | null
          type: Database["public"]["Enums"]["account_type"]
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          parent_account_id?: string | null
          subtype?: string | null
          type?: Database["public"]["Enums"]["account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
        ]
      }
      appointment_services: {
        Row: {
          appointment_id: string
          duration_minutes: number
          id: string
          price_cents: number
          service_id: string
          sort_order: number
          staff_id: string | null
        }
        Insert: {
          appointment_id: string
          duration_minutes: number
          id?: string
          price_cents: number
          service_id: string
          sort_order?: number
          staff_id?: string | null
        }
        Update: {
          appointment_id?: string
          duration_minutes?: number
          id?: string
          price_cents?: number
          service_id?: string
          sort_order?: number
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_services_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          branch_id: string
          created_at: string
          created_by_staff_id: string | null
          customer_id: string
          end_at: string
          id: string
          notes: string | null
          org_id: string
          source: Database["public"]["Enums"]["appointment_source"]
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by_staff_id?: string | null
          customer_id: string
          end_at: string
          id?: string
          notes?: string | null
          org_id: string
          source?: Database["public"]["Enums"]["appointment_source"]
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by_staff_id?: string | null
          customer_id?: string
          end_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          source?: Database["public"]["Enums"]["appointment_source"]
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "appointments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_inventory: {
        Row: {
          branch_id: string
          id: string
          product_id: string
          quantity_on_hand: number
          reorder_quantity: number
          reorder_threshold: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          id?: string
          product_id: string
          quantity_on_hand?: number
          reorder_quantity?: number
          reorder_threshold?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          id?: string
          product_id?: string
          quantity_on_hand?: number
          reorder_quantity?: number
          reorder_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_service_overrides: {
        Row: {
          branch_id: string
          id: string
          is_offered: boolean
          price_cents: number | null
          service_id: string
        }
        Insert: {
          branch_id: string
          id?: string
          is_offered?: boolean
          price_cents?: number | null
          service_id: string
        }
        Update: {
          branch_id?: string
          id?: string
          is_offered?: boolean
          price_cents?: number | null
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_service_overrides_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_service_overrides_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          allowed_embed_origins: string[]
          booking_enabled: boolean
          created_at: string
          deposit_amount_cents: number | null
          deposit_percent: number | null
          deposit_required: boolean
          id: string
          is_active: boolean
          name: string
          org_id: string
          phone: string | null
          slug: string
          stripe_location_id: string | null
          timezone: string
        }
        Insert: {
          address?: string | null
          allowed_embed_origins?: string[]
          booking_enabled?: boolean
          created_at?: string
          deposit_amount_cents?: number | null
          deposit_percent?: number | null
          deposit_required?: boolean
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          phone?: string | null
          slug: string
          stripe_location_id?: string | null
          timezone?: string
        }
        Update: {
          address?: string | null
          allowed_embed_origins?: string[]
          booking_enabled?: boolean
          created_at?: string
          deposit_amount_cents?: number | null
          deposit_percent?: number | null
          deposit_required?: boolean
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          phone?: string | null
          slug?: string
          stripe_location_id?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_drawer_sessions: {
        Row: {
          closed_at: string | null
          closed_by_staff_id: string | null
          counted_amount_cents: number | null
          expected_amount_cents: number | null
          id: string
          opened_at: string
          opened_by_staff_id: string
          opening_amount_cents: number
          register_id: string
          status: Database["public"]["Enums"]["drawer_session_status"]
          variance_cents: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by_staff_id?: string | null
          counted_amount_cents?: number | null
          expected_amount_cents?: number | null
          id?: string
          opened_at?: string
          opened_by_staff_id: string
          opening_amount_cents: number
          register_id: string
          status?: Database["public"]["Enums"]["drawer_session_status"]
          variance_cents?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by_staff_id?: string | null
          counted_amount_cents?: number | null
          expected_amount_cents?: number | null
          id?: string
          opened_at?: string
          opened_by_staff_id?: string
          opening_amount_cents?: number
          register_id?: string
          status?: Database["public"]["Enums"]["drawer_session_status"]
          variance_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_drawer_sessions_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_opened_by_staff_id_fkey"
            columns: ["opened_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_drawer_sessions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          branch_id: string | null
          id: string
          org_id: string
          priority: number
          product_id: string | null
          rate_type: string
          rate_value: number
          role: Database["public"]["Enums"]["role_type"] | null
          service_id: string | null
        }
        Insert: {
          branch_id?: string | null
          id?: string
          org_id: string
          priority?: number
          product_id?: string | null
          rate_type: string
          rate_value: number
          role?: Database["public"]["Enums"]["role_type"] | null
          service_id?: string | null
        }
        Update: {
          branch_id?: string | null
          id?: string
          org_id?: string
          priority?: number
          product_id?: string | null
          rate_type?: string
          rate_value?: number
          role?: Database["public"]["Enums"]["role_type"] | null
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_package_redemptions: {
        Row: {
          customer_package_id: string
          id: string
          pos_transaction_item_id: string | null
          quantity: number
          redeemed_at: string
          service_id: string
        }
        Insert: {
          customer_package_id: string
          id?: string
          pos_transaction_item_id?: string | null
          quantity?: number
          redeemed_at?: string
          service_id: string
        }
        Update: {
          customer_package_id?: string
          id?: string
          pos_transaction_item_id?: string | null
          quantity?: number
          redeemed_at?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_package_redemptions_customer_package_id_fkey"
            columns: ["customer_package_id"]
            isOneToOne: false
            referencedRelation: "customer_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_package_redemptions_pos_transaction_item_id_fkey"
            columns: ["pos_transaction_item_id"]
            isOneToOne: false
            referencedRelation: "pos_transaction_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_package_redemptions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_package_units: {
        Row: {
          customer_package_id: string
          id: string
          quantity_total: number
          quantity_used: number
          service_id: string
        }
        Insert: {
          customer_package_id: string
          id?: string
          quantity_total: number
          quantity_used?: number
          service_id: string
        }
        Update: {
          customer_package_id?: string
          id?: string
          quantity_total?: number
          quantity_used?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_package_units_customer_package_id_fkey"
            columns: ["customer_package_id"]
            isOneToOne: false
            referencedRelation: "customer_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_package_units_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_packages: {
        Row: {
          customer_id: string
          expires_at: string | null
          id: string
          package_id: string
          purchased_at: string
          purchased_branch_id: string | null
          source_transaction_id: string | null
          status: Database["public"]["Enums"]["customer_package_status"]
        }
        Insert: {
          customer_id: string
          expires_at?: string | null
          id?: string
          package_id: string
          purchased_at?: string
          purchased_branch_id?: string | null
          source_transaction_id?: string | null
          status?: Database["public"]["Enums"]["customer_package_status"]
        }
        Update: {
          customer_id?: string
          expires_at?: string | null
          id?: string
          package_id?: string
          purchased_at?: string
          purchased_branch_id?: string | null
          source_transaction_id?: string | null
          status?: Database["public"]["Enums"]["customer_package_status"]
        }
        Relationships: [
          {
            foreignKeyName: "customer_packages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_packages_purchased_branch_id_fkey"
            columns: ["purchased_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_packages_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          auth_user_id: string | null
          created_at: string
          dob: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          marketing_opt_in: boolean
          notes: string | null
          org_id: string
          phone: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          marketing_opt_in?: boolean
          notes?: string | null
          org_id: string
          phone?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          dob?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          marketing_opt_in?: boolean
          notes?: string | null
          org_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          default_account_id: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          default_account_id?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          default_account_id?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "expense_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          branch_id: string
          category_id: string
          created_at: string
          created_by_staff_id: string
          description: string | null
          expense_date: string
          id: string
          journal_entry_id: string | null
          org_id: string
          payment_method: string
          receipt_url: string | null
          status: string
          tax_cents: number
          vendor_id: string | null
        }
        Insert: {
          amount_cents: number
          branch_id: string
          category_id: string
          created_at?: string
          created_by_staff_id: string
          description?: string | null
          expense_date?: string
          id?: string
          journal_entry_id?: string | null
          org_id: string
          payment_method: string
          receipt_url?: string | null
          status?: string
          tax_cents?: number
          vendor_id?: string | null
        }
        Update: {
          amount_cents?: number
          branch_id?: string
          category_id?: string
          created_at?: string
          created_by_staff_id?: string
          description?: string | null
          expense_date?: string
          id?: string
          journal_entry_id?: string | null
          org_id?: string
          payment_method?: string
          receipt_url?: string | null
          status?: string
          tax_cents?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          gift_card_id: string
          id: string
          pos_transaction_id: string | null
          type: Database["public"]["Enums"]["gift_card_txn_type"]
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          gift_card_id: string
          id?: string
          pos_transaction_id?: string | null
          type: Database["public"]["Enums"]["gift_card_txn_type"]
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          gift_card_id?: string
          id?: string
          pos_transaction_id?: string | null
          type?: Database["public"]["Enums"]["gift_card_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_card_transactions_pos_transaction_id_fkey"
            columns: ["pos_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance_cents: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          initial_value_cents: number
          is_active: boolean
          issued_branch_id: string | null
          issued_to_customer_id: string | null
          org_id: string
        }
        Insert: {
          balance_cents: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          initial_value_cents: number
          is_active?: boolean
          issued_branch_id?: string | null
          issued_to_customer_id?: string | null
          org_id: string
        }
        Update: {
          balance_cents?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          initial_value_cents?: number
          is_active?: boolean
          issued_branch_id?: string | null
          issued_to_customer_id?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_issued_branch_id_fkey"
            columns: ["issued_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_issued_to_customer_id_fkey"
            columns: ["issued_to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          product_id: string
          quantity_delta: number
          reason: Database["public"]["Enums"]["inventory_adjustment_reason"]
          reference_id: string | null
          reference_type: string | null
          staff_id: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity_delta: number
          reason: Database["public"]["Enums"]["inventory_adjustment_reason"]
          reference_id?: string | null
          reference_type?: string | null
          staff_id?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity_delta?: number
          reason?: Database["public"]["Enums"]["inventory_adjustment_reason"]
          reference_id?: string | null
          reference_type?: string | null
          staff_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          branch_id: string | null
          created_by_staff_id: string | null
          description: string | null
          entry_date: string
          id: string
          is_reversal: boolean
          org_id: string
          posted_at: string
          reversed_entry_id: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["journal_source_type"]
        }
        Insert: {
          branch_id?: string | null
          created_by_staff_id?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          is_reversal?: boolean
          org_id: string
          posted_at?: string
          reversed_entry_id?: string | null
          source_id?: string | null
          source_type: Database["public"]["Enums"]["journal_source_type"]
        }
        Update: {
          branch_id?: string | null
          created_by_staff_id?: string | null
          description?: string | null
          entry_date?: string
          id?: string
          is_reversal?: boolean
          org_id?: string
          posted_at?: string
          reversed_entry_id?: string | null
          source_id?: string | null
          source_type?: Database["public"]["Enums"]["journal_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entries_reversed_entry_id_fkey"
            columns: ["reversed_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          branch_id: string | null
          credit_cents: number
          debit_cents: number
          id: string
          journal_entry_id: string
          memo: string | null
        }
        Insert: {
          account_id: string
          branch_id?: string | null
          credit_cents?: number
          debit_cents?: number
          id?: string
          journal_entry_id: string
          memo?: string | null
        }
        Update: {
          account_id?: string
          branch_id?: string | null
          credit_cents?: number
          debit_cents?: number
          id?: string
          journal_entry_id?: string
          memo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_trial_balance"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "journal_entry_lines_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          settings: Json
          timezone: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          settings?: Json
          timezone?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          settings?: Json
          timezone?: string
        }
        Relationships: []
      }
      package_items: {
        Row: {
          id: string
          package_id: string
          quantity: number
          service_id: string
        }
        Insert: {
          id?: string
          package_id: string
          quantity?: number
          service_id: string
        }
        Update: {
          id?: string
          package_id?: string
          quantity?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_items_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          price_cents: number
          type: Database["public"]["Enums"]["package_type"]
          validity_days: number | null
        }
        Insert: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          price_cents: number
          type?: Database["public"]["Enums"]["package_type"]
          validity_days?: number | null
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          price_cents?: number
          type?: Database["public"]["Enums"]["package_type"]
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          base_pay_cents: number
          branch_id: string | null
          commission_cents: number
          deductions_cents: number
          gross_pay_cents: number
          id: string
          journal_entry_id: string | null
          net_pay_cents: number | null
          payroll_period_id: string
          staff_id: string
          tips_cents: number
        }
        Insert: {
          base_pay_cents?: number
          branch_id?: string | null
          commission_cents?: number
          deductions_cents?: number
          gross_pay_cents?: number
          id?: string
          journal_entry_id?: string | null
          net_pay_cents?: number | null
          payroll_period_id: string
          staff_id: string
          tips_cents?: number
        }
        Update: {
          base_pay_cents?: number
          branch_id?: string | null
          commission_cents?: number
          deductions_cents?: number
          gross_pay_cents?: number
          id?: string
          journal_entry_id?: string | null
          net_pay_cents?: number | null
          payroll_period_id?: string
          staff_id?: string
          tips_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          id: string
          org_id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          id?: string
          org_id: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          id?: string
          org_id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_discounts: {
        Row: {
          applied_by_staff_id: string
          discount_type: string
          id: string
          reason: string | null
          transaction_id: string | null
          transaction_item_id: string | null
          value: number
        }
        Insert: {
          applied_by_staff_id: string
          discount_type: string
          id?: string
          reason?: string | null
          transaction_id?: string | null
          transaction_item_id?: string | null
          value: number
        }
        Update: {
          applied_by_staff_id?: string
          discount_type?: string
          id?: string
          reason?: string | null
          transaction_id?: string | null
          transaction_item_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_discounts_applied_by_staff_id_fkey"
            columns: ["applied_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_discounts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_discounts_transaction_item_id_fkey"
            columns: ["transaction_item_id"]
            isOneToOne: false
            referencedRelation: "pos_transaction_items"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_payments: {
        Row: {
          amount_cents: number
          created_at: string
          gift_card_id: string | null
          id: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          status: Database["public"]["Enums"]["pos_payment_status"]
          store_credit_id: string | null
          stripe_payment_intent_id: string | null
          transaction_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          gift_card_id?: string | null
          id?: string
          method: Database["public"]["Enums"]["pos_payment_method"]
          status?: Database["public"]["Enums"]["pos_payment_status"]
          store_credit_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          gift_card_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["pos_payment_method"]
          status?: Database["public"]["Enums"]["pos_payment_status"]
          store_credit_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_registers: {
        Row: {
          branch_id: string
          id: string
          name: string
        }
        Insert: {
          branch_id: string
          id?: string
          name: string
        }
        Update: {
          branch_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pos_registers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transaction_items: {
        Row: {
          cogs_cents: number | null
          description: string
          discount_cents: number
          id: string
          item_type: Database["public"]["Enums"]["pos_item_type"]
          quantity: number
          reference_id: string | null
          staff_id: string | null
          tax_cents: number
          total_cents: number
          transaction_id: string
          unit_price_cents: number
        }
        Insert: {
          cogs_cents?: number | null
          description: string
          discount_cents?: number
          id?: string
          item_type: Database["public"]["Enums"]["pos_item_type"]
          quantity?: number
          reference_id?: string | null
          staff_id?: string | null
          tax_cents?: number
          total_cents: number
          transaction_id: string
          unit_price_cents: number
        }
        Update: {
          cogs_cents?: number | null
          description?: string
          discount_cents?: number
          id?: string
          item_type?: Database["public"]["Enums"]["pos_item_type"]
          quantity?: number
          reference_id?: string | null
          staff_id?: string | null
          tax_cents?: number
          total_cents?: number
          transaction_id?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transaction_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_transactions: {
        Row: {
          appointment_id: string | null
          branch_id: string
          created_at: string
          customer_id: string | null
          discount_cents: number
          drawer_session_id: string
          id: string
          org_id: string
          original_transaction_id: string | null
          register_id: string
          staff_id: string
          status: Database["public"]["Enums"]["pos_transaction_status"]
          subtotal_cents: number
          tax_cents: number
          tip_cents: number
          total_cents: number
        }
        Insert: {
          appointment_id?: string | null
          branch_id: string
          created_at?: string
          customer_id?: string | null
          discount_cents?: number
          drawer_session_id: string
          id?: string
          org_id: string
          original_transaction_id?: string | null
          register_id: string
          staff_id: string
          status?: Database["public"]["Enums"]["pos_transaction_status"]
          subtotal_cents?: number
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
        }
        Update: {
          appointment_id?: string | null
          branch_id?: string
          created_at?: string
          customer_id?: string | null
          discount_cents?: number
          drawer_session_id?: string
          id?: string
          org_id?: string
          original_transaction_id?: string | null
          register_id?: string
          staff_id?: string
          status?: Database["public"]["Enums"]["pos_transaction_status"]
          subtotal_cents?: number
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "pos_transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_drawer_session_id_fkey"
            columns: ["drawer_session_id"]
            isOneToOne: false
            referencedRelation: "cash_drawer_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "pos_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pos_transactions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          id: string
          name: string
          org_id: string
        }
        Insert: {
          id?: string
          name: string
          org_id: string
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          cost_cents: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          retail_price_cents: number
          sku: string
          track_inventory: boolean
        }
        Insert: {
          category_id?: string | null
          cost_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          retail_price_cents: number
          sku: string
          track_inventory?: boolean
        }
        Update: {
          category_id?: string | null
          cost_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          retail_price_cents?: number
          sku?: string
          track_inventory?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          id: string
          name: string
          org_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          name: string
          org_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          category_id: string | null
          created_at: string
          default_price_cents: number
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_price_cents: number
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_price_cents?: number
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          avatar_url: string | null
          base_hourly_rate_cents: number | null
          created_at: string
          email: string
          employment_status: string
          first_name: string
          hire_date: string | null
          id: string
          last_name: string
          org_id: string
          pay_type: string
          phone: string | null
        }
        Insert: {
          avatar_url?: string | null
          base_hourly_rate_cents?: number | null
          created_at?: string
          email: string
          employment_status?: string
          first_name: string
          hire_date?: string | null
          id: string
          last_name: string
          org_id: string
          pay_type?: string
          phone?: string | null
        }
        Update: {
          avatar_url?: string | null
          base_hourly_rate_cents?: number | null
          created_at?: string
          email?: string
          employment_status?: string
          first_name?: string
          hire_date?: string | null
          id?: string
          last_name?: string
          org_id?: string
          pay_type?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_branch_roles: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_primary: boolean
          role: Database["public"]["Enums"]["role_type"]
          staff_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          role: Database["public"]["Enums"]["role_type"]
          staff_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          role?: Database["public"]["Enums"]["role_type"]
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_branch_roles_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_commissions: {
        Row: {
          base_amount_cents: number
          commission_amount_cents: number
          created_at: string
          id: string
          pos_transaction_item_id: string
          rule_id: string | null
          staff_id: string
        }
        Insert: {
          base_amount_cents: number
          commission_amount_cents: number
          created_at?: string
          id?: string
          pos_transaction_item_id: string
          rule_id?: string | null
          staff_id: string
        }
        Update: {
          base_amount_cents?: number
          commission_amount_cents?: number
          created_at?: string
          id?: string
          pos_transaction_item_id?: string
          rule_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_commissions_pos_transaction_item_id_fkey"
            columns: ["pos_transaction_item_id"]
            isOneToOne: false
            referencedRelation: "pos_transaction_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_commissions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_commissions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted_at: string | null
          branch_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_staff_id: string | null
          org_id: string
          role: Database["public"]["Enums"]["role_type"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by_staff_id?: string | null
          org_id: string
          role: Database["public"]["Enums"]["role_type"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          branch_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_staff_id?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["role_type"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invites_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_invited_by_staff_id_fkey"
            columns: ["invited_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          branch_id: string
          day_of_week: number
          effective_from: string
          effective_to: string | null
          end_time: string
          id: string
          staff_id: string
          start_time: string
        }
        Insert: {
          branch_id: string
          day_of_week: number
          effective_from?: string
          effective_to?: string | null
          end_time: string
          id?: string
          staff_id: string
          start_time: string
        }
        Update: {
          branch_id?: string
          day_of_week?: number
          effective_from?: string
          effective_to?: string | null
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          service_id: string
          staff_id: string
        }
        Insert: {
          service_id: string
          staff_id: string
        }
        Update: {
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_off: {
        Row: {
          branch_id: string | null
          end_at: string
          id: string
          reason: string | null
          staff_id: string
          start_at: string
        }
        Insert: {
          branch_id?: string | null
          end_at: string
          id?: string
          reason?: string | null
          staff_id: string
          start_at: string
        }
        Update: {
          branch_id?: string | null
          end_at?: string
          id?: string
          reason?: string | null
          staff_id?: string
          start_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_off_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_off_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credit_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          created_at: string
          id: string
          pos_transaction_id: string | null
          reason: string | null
          store_credit_id: string
          type: Database["public"]["Enums"]["store_credit_txn_type"]
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          created_at?: string
          id?: string
          pos_transaction_id?: string | null
          reason?: string | null
          store_credit_id: string
          type: Database["public"]["Enums"]["store_credit_txn_type"]
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          created_at?: string
          id?: string
          pos_transaction_id?: string | null
          reason?: string | null
          store_credit_id?: string
          type?: Database["public"]["Enums"]["store_credit_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "store_credit_transactions_pos_transaction_id_fkey"
            columns: ["pos_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_credit_transactions_store_credit_id_fkey"
            columns: ["store_credit_id"]
            isOneToOne: false
            referencedRelation: "store_credits"
            referencedColumns: ["id"]
          },
        ]
      }
      store_credits: {
        Row: {
          balance_cents: number
          customer_id: string
          id: string
          updated_at: string
        }
        Insert: {
          balance_cents?: number
          customer_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          balance_cents?: number
          customer_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      tips: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          payout_method: string
          pos_transaction_id: string
          staff_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          payout_method?: string
          pos_transaction_id: string
          staff_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          payout_method?: string
          pos_transaction_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_pos_transaction_id_fkey"
            columns: ["pos_transaction_id"]
            isOneToOne: false
            referencedRelation: "pos_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          contact_name: string | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          org_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_balance_sheet: {
        Row: {
          balance_cents: number | null
          code: string | null
          name: string | null
          org_id: string | null
          type: Database["public"]["Enums"]["account_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_profit_and_loss: {
        Row: {
          code: string | null
          entry_date: string | null
          name: string | null
          net_cents: number | null
          org_id: string | null
          type: Database["public"]["Enums"]["account_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_trial_balance: {
        Row: {
          account_id: string | null
          balance_cents: number | null
          code: string | null
          name: string | null
          org_id: string | null
          total_credits_cents: number | null
          total_debits_cents: number | null
          type: Database["public"]["Enums"]["account_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
      appointment_source: "online" | "walk_in" | "phone" | "staff"
      appointment_status:
        | "pending"
        | "confirmed"
        | "checked_in"
        | "completed"
        | "cancelled"
        | "no_show"
      billing_interval: "one_time" | "monthly" | "annual"
      customer_package_status: "active" | "expired" | "cancelled"
      drawer_session_status: "open" | "closed"
      gift_card_txn_type: "issue" | "redeem" | "reload" | "adjust"
      inventory_adjustment_reason:
        | "receiving"
        | "sale"
        | "refund"
        | "damage"
        | "count_correction"
        | "transfer"
      journal_source_type:
        | "pos_sale"
        | "pos_refund"
        | "expense"
        | "payroll"
        | "manual"
        | "adjustment"
      package_type: "prepaid_services" | "membership"
      pos_item_type: "service" | "product" | "package" | "membership_redemption"
      pos_payment_method:
        | "cash"
        | "card_stripe"
        | "gift_card"
        | "store_credit"
        | "package_credit"
      pos_payment_status: "pending" | "succeeded" | "failed" | "refunded"
      pos_transaction_status:
        | "completed"
        | "voided"
        | "refunded"
        | "partially_refunded"
      role_type: "owner" | "manager" | "front_desk" | "therapist"
      store_credit_txn_type: "issue" | "redeem" | "adjust"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["asset", "liability", "equity", "revenue", "expense"],
      appointment_source: ["online", "walk_in", "phone", "staff"],
      appointment_status: [
        "pending",
        "confirmed",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
      ],
      billing_interval: ["one_time", "monthly", "annual"],
      customer_package_status: ["active", "expired", "cancelled"],
      drawer_session_status: ["open", "closed"],
      gift_card_txn_type: ["issue", "redeem", "reload", "adjust"],
      inventory_adjustment_reason: [
        "receiving",
        "sale",
        "refund",
        "damage",
        "count_correction",
        "transfer",
      ],
      journal_source_type: [
        "pos_sale",
        "pos_refund",
        "expense",
        "payroll",
        "manual",
        "adjustment",
      ],
      package_type: ["prepaid_services", "membership"],
      pos_item_type: ["service", "product", "package", "membership_redemption"],
      pos_payment_method: [
        "cash",
        "card_stripe",
        "gift_card",
        "store_credit",
        "package_credit",
      ],
      pos_payment_status: ["pending", "succeeded", "failed", "refunded"],
      pos_transaction_status: [
        "completed",
        "voided",
        "refunded",
        "partially_refunded",
      ],
      role_type: ["owner", "manager", "front_desk", "therapist"],
      store_credit_txn_type: ["issue", "redeem", "adjust"],
    },
  },
} as const
