export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      body_goals: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          start_weight_kg: number | null;
          target_body_fat_pct: number | null;
          target_weight_kg: number | null;
          updated_at: string;
          user_id: string;
          valid_from: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          start_weight_kg?: number | null;
          target_body_fat_pct?: number | null;
          target_weight_kg?: number | null;
          updated_at?: string;
          user_id?: string;
          valid_from: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          start_weight_kg?: number | null;
          target_body_fat_pct?: number | null;
          target_weight_kg?: number | null;
          updated_at?: string;
          user_id?: string;
          valid_from?: string;
        };
        Relationships: [];
      };
      body_metrics: {
        Row: {
          arm_cm: number | null;
          bf_method: string | null;
          body_fat_pct: number | null;
          chest_cm: number | null;
          created_at: string;
          day: string;
          deleted_at: string | null;
          hips_cm: number | null;
          id: string;
          notes: string | null;
          thigh_cm: number | null;
          updated_at: string;
          user_id: string;
          waist_cm: number | null;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          arm_cm?: number | null;
          bf_method?: string | null;
          body_fat_pct?: number | null;
          chest_cm?: number | null;
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          hips_cm?: number | null;
          id?: string;
          notes?: string | null;
          thigh_cm?: number | null;
          updated_at?: string;
          user_id?: string;
          waist_cm?: number | null;
          weight_kg?: number | null;
        };
        Update: {
          arm_cm?: number | null;
          bf_method?: string | null;
          body_fat_pct?: number | null;
          chest_cm?: number | null;
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          hips_cm?: number | null;
          id?: string;
          notes?: string | null;
          thigh_cm?: number | null;
          updated_at?: string;
          user_id?: string;
          waist_cm?: number | null;
          weight_kg?: number | null;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          granted_at: string;
          id: string;
          policy_version: string;
          type: string;
          updated_at: string;
          user_id: string;
          withdrawn_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          granted_at?: string;
          id?: string;
          policy_version: string;
          type: string;
          updated_at?: string;
          user_id?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          granted_at?: string;
          id?: string;
          policy_version?: string;
          type?: string;
          updated_at?: string;
          user_id?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };
      exercises: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          equipment: string;
          id: string;
          image_path: string | null;
          log_type: string;
          name: string;
          owner_id: string | null;
          primary_muscle: string;
          secondary_muscles: string[];
          slug: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          equipment: string;
          id?: string;
          image_path?: string | null;
          log_type?: string;
          name: string;
          owner_id?: string | null;
          primary_muscle: string;
          secondary_muscles?: string[];
          slug?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          equipment?: string;
          id?: string;
          image_path?: string | null;
          log_type?: string;
          name?: string;
          owner_id?: string | null;
          primary_muscle?: string;
          secondary_muscles?: string[];
          slug?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      fixed_meal_checks: {
        Row: {
          carbs_g: number;
          checked_at: string;
          created_at: string;
          day: string;
          deleted_at: string | null;
          fat_g: number;
          fixed_meal_id: string;
          id: string;
          kcal: number;
          protein_g: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          carbs_g?: number;
          checked_at?: string;
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          fat_g?: number;
          fixed_meal_id: string;
          id?: string;
          kcal?: number;
          protein_g?: number;
          status: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          carbs_g?: number;
          checked_at?: string;
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          fat_g?: number;
          fixed_meal_id?: string;
          id?: string;
          kcal?: number;
          protein_g?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fixed_meal_checks_fixed_meal_id_fkey';
            columns: ['fixed_meal_id'];
            isOneToOne: false;
            referencedRelation: 'fixed_meals';
            referencedColumns: ['id'];
          },
        ];
      };
      fixed_meal_plans: {
        Row: {
          active: boolean;
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          source: string;
          updated_at: string;
          user_id: string;
          workout_after_meal_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          source?: string;
          updated_at?: string;
          user_id?: string;
          workout_after_meal_id?: string | null;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          source?: string;
          updated_at?: string;
          user_id?: string;
          workout_after_meal_id?: string | null;
        };
        Relationships: [];
      };
      fixed_meals: {
        Row: {
          carbs_g: number;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          fat_g: number;
          id: string;
          is_main: boolean;
          kcal: number;
          name: string;
          plan_id: string;
          position: number;
          protein_g: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          carbs_g?: number;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          fat_g?: number;
          id?: string;
          is_main?: boolean;
          kcal: number;
          name: string;
          plan_id: string;
          position: number;
          protein_g?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          carbs_g?: number;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          fat_g?: number;
          id?: string;
          is_main?: boolean;
          kcal?: number;
          name?: string;
          plan_id?: string;
          position?: number;
          protein_g?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fixed_meals_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'fixed_meal_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      food_logs: {
        Row: {
          carbs_g: number;
          created_at: string;
          day: string;
          deleted_at: string | null;
          fat_g: number;
          food_id: string | null;
          grams: number | null;
          id: string;
          kcal: number;
          meal: string;
          name: string;
          protein_g: number;
          quantity_label: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          carbs_g?: number;
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          fat_g?: number;
          food_id?: string | null;
          grams?: number | null;
          id?: string;
          kcal: number;
          meal: string;
          name: string;
          protein_g?: number;
          quantity_label?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          carbs_g?: number;
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          fat_g?: number;
          food_id?: string | null;
          grams?: number | null;
          id?: string;
          kcal?: number;
          meal?: string;
          name?: string;
          protein_g?: number;
          quantity_label?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_logs_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      food_servings: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          food_id: string;
          grams: number;
          id: string;
          label: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          food_id: string;
          grams: number;
          id?: string;
          label: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          food_id?: string;
          grams?: number;
          id?: string;
          label?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'food_servings_food_id_fkey';
            columns: ['food_id'];
            isOneToOne: false;
            referencedRelation: 'foods';
            referencedColumns: ['id'];
          },
        ];
      };
      foods: {
        Row: {
          barcode: string | null;
          brand: string | null;
          carbs_100g: number;
          created_at: string;
          deleted_at: string | null;
          fat_100g: number;
          fiber_100g: number | null;
          id: string;
          kcal_100g: number;
          name: string;
          owner_id: string | null;
          protein_100g: number;
          salt_100g: number | null;
          saturates_100g: number | null;
          source: string;
          sugars_100g: number | null;
          updated_at: string;
          verified: boolean;
        };
        ComputedFields: never;
        Insert: {
          barcode?: string | null;
          brand?: string | null;
          carbs_100g?: number;
          created_at?: string;
          deleted_at?: string | null;
          fat_100g?: number;
          fiber_100g?: number | null;
          id?: string;
          kcal_100g: number;
          name: string;
          owner_id?: string | null;
          protein_100g?: number;
          salt_100g?: number | null;
          saturates_100g?: number | null;
          source?: string;
          sugars_100g?: number | null;
          updated_at?: string;
          verified?: boolean;
        };
        Update: {
          barcode?: string | null;
          brand?: string | null;
          carbs_100g?: number;
          created_at?: string;
          deleted_at?: string | null;
          fat_100g?: number;
          fiber_100g?: number | null;
          id?: string;
          kcal_100g?: number;
          name?: string;
          owner_id?: string | null;
          protein_100g?: number;
          salt_100g?: number | null;
          saturates_100g?: number | null;
          source?: string;
          sugars_100g?: number | null;
          updated_at?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      nutrition_goals: {
        Row: {
          carbs_g: number;
          created_at: string;
          deleted_at: string | null;
          fat_g: number;
          id: string;
          kcal: number;
          maintenance_kcal: number | null;
          protein_g: number;
          training_day_bonus_kcal: number;
          updated_at: string;
          user_id: string;
          valid_from: string;
          water_ml: number;
        };
        ComputedFields: never;
        Insert: {
          carbs_g: number;
          created_at?: string;
          deleted_at?: string | null;
          fat_g: number;
          id?: string;
          kcal: number;
          maintenance_kcal?: number | null;
          protein_g: number;
          training_day_bonus_kcal?: number;
          updated_at?: string;
          user_id?: string;
          valid_from: string;
          water_ml?: number;
        };
        Update: {
          carbs_g?: number;
          created_at?: string;
          deleted_at?: string | null;
          fat_g?: number;
          id?: string;
          kcal?: number;
          maintenance_kcal?: number | null;
          protein_g?: number;
          training_day_bonus_kcal?: number;
          updated_at?: string;
          user_id?: string;
          valid_from?: string;
          water_ml?: number;
        };
        Relationships: [];
      };
      plan_days: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          id: string;
          name: string;
          plan_id: string;
          position: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name: string;
          plan_id: string;
          position: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          name?: string;
          plan_id?: string;
          position?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_days_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'workout_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      plan_exercises: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          exercise_id: string;
          id: string;
          notes: string | null;
          superset_with_next: boolean;
          plan_day_id: string;
          position: number;
          rest_s: number;
          target_reps: string;
          target_sets: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          exercise_id: string;
          id?: string;
          notes?: string | null;
          superset_with_next?: boolean;
          plan_day_id: string;
          position: number;
          rest_s?: number;
          target_reps?: string;
          target_sets?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          exercise_id?: string;
          id?: string;
          notes?: string | null;
          superset_with_next?: boolean;
          plan_day_id?: string;
          position?: number;
          rest_s?: number;
          target_reps?: string;
          target_sets?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_exercises_plan_day_id_fkey';
            columns: ['plan_day_id'];
            isOneToOne: false;
            referencedRelation: 'plan_days';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          activity_level: string | null;
          birth_date: string | null;
          created_at: string;
          deleted_at: string | null;
          diet_mode: string;
          experience: string | null;
          goal: string | null;
          height_cm: number | null;
          id: string;
          name: string | null;
          onboarding_completed_at: string | null;
          sex: string | null;
          timezone: string;
          training_location: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          activity_level?: string | null;
          birth_date?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          diet_mode?: string;
          experience?: string | null;
          goal?: string | null;
          height_cm?: number | null;
          id: string;
          name?: string | null;
          onboarding_completed_at?: string | null;
          sex?: string | null;
          timezone?: string;
          training_location?: string | null;
          updated_at?: string;
        };
        Update: {
          activity_level?: string | null;
          birth_date?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          diet_mode?: string;
          experience?: string | null;
          goal?: string | null;
          height_cm?: number | null;
          id?: string;
          name?: string | null;
          onboarding_completed_at?: string | null;
          sex?: string | null;
          timezone?: string;
          training_location?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      progress_photos: {
        Row: {
          created_at: string;
          day: string;
          deleted_at: string | null;
          id: string;
          pose: string;
          storage_path: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          id?: string;
          pose: string;
          storage_path: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          id?: string;
          pose?: string;
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      session_exercises: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          exercise_id: string;
          id: string;
          notes: string | null;
          superset_with_next: boolean;
          position: number;
          rest_s: number | null;
          session_id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          exercise_id: string;
          id?: string;
          notes?: string | null;
          superset_with_next?: boolean;
          position: number;
          rest_s?: number | null;
          session_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          exercise_id?: string;
          id?: string;
          notes?: string | null;
          superset_with_next?: boolean;
          position?: number;
          rest_s?: number | null;
          session_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_exercises_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_exercises_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      session_sets: {
        Row: {
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          distance_m: number | null;
          duration_s: number | null;
          exercise_id: string;
          id: string;
          reps: number | null;
          session_id: string;
          set_index: number;
          updated_at: string;
          user_id: string;
          weight_kg: number | null;
        };
        ComputedFields: never;
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          distance_m?: number | null;
          duration_s?: number | null;
          exercise_id: string;
          id?: string;
          reps?: number | null;
          session_id: string;
          set_index: number;
          updated_at?: string;
          user_id?: string;
          weight_kg?: number | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          distance_m?: number | null;
          duration_s?: number | null;
          exercise_id?: string;
          id?: string;
          reps?: number | null;
          session_id?: string;
          set_index?: number;
          updated_at?: string;
          user_id?: string;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'session_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'session_sets_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'workout_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          accent: string;
          bold_text: boolean;
          created_at: string;
          deleted_at: string | null;
          dot_numbers: boolean;
          energy_unit: string;
          haptics: boolean;
          high_contrast: boolean;
          language: string;
          length_unit: string;
          notifications: NonNullable<Json>;
          one_hand_mode: boolean;
          reduce_motion: boolean;
          spoken_countdown: boolean;
          text_scale: number;
          theme: string;
          workout_theme: string;
          updated_at: string;
          user_id: string;
          water_glass_ml: number;
          small_plates: boolean;
          week_start: string;
          weight_unit: string;
        };
        ComputedFields: never;
        Insert: {
          accent?: string;
          bold_text?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          dot_numbers?: boolean;
          energy_unit?: string;
          haptics?: boolean;
          high_contrast?: boolean;
          language?: string;
          length_unit?: string;
          notifications?: NonNullable<Json>;
          one_hand_mode?: boolean;
          reduce_motion?: boolean;
          spoken_countdown?: boolean;
          text_scale?: number;
          theme?: string;
          workout_theme?: string;
          updated_at?: string;
          user_id: string;
          water_glass_ml?: number;
          small_plates?: boolean;
          week_start?: string;
          weight_unit?: string;
        };
        Update: {
          accent?: string;
          bold_text?: boolean;
          created_at?: string;
          deleted_at?: string | null;
          dot_numbers?: boolean;
          energy_unit?: string;
          haptics?: boolean;
          high_contrast?: boolean;
          language?: string;
          length_unit?: string;
          notifications?: NonNullable<Json>;
          one_hand_mode?: boolean;
          reduce_motion?: boolean;
          spoken_countdown?: boolean;
          text_scale?: number;
          theme?: string;
          updated_at?: string;
          user_id?: string;
          water_glass_ml?: number;
          small_plates?: boolean;
          week_start?: string;
          weight_unit?: string;
          workout_theme?: string;
        };
        Relationships: [];
      };
      water_logs: {
        Row: {
          created_at: string;
          day: string;
          deleted_at: string | null;
          id: string;
          ml: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          id?: string;
          ml: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          id?: string;
          ml?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      supplements: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          dose: string | null;
          id: string;
          name: string;
          position: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          dose?: string | null;
          id?: string;
          name: string;
          position?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          dose?: string | null;
          id?: string;
          name?: string;
          position?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      supplement_logs: {
        Row: {
          created_at: string;
          day: string;
          deleted_at: string | null;
          id: string;
          supplement_id: string;
          taken_at: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          day: string;
          deleted_at?: string | null;
          id?: string;
          supplement_id: string;
          taken_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          day?: string;
          deleted_at?: string | null;
          id?: string;
          supplement_id?: string;
          taken_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_plans: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          goal: string | null;
          id: string;
          name: string;
          source: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          goal?: string | null;
          id?: string;
          name: string;
          source?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          goal?: string | null;
          id?: string;
          name?: string;
          source?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          created_at: string;
          cycle_number: number | null;
          day_name: string | null;
          deleted_at: string | null;
          ended_at: string | null;
          feeling: number | null;
          id: string;
          notes: string | null;
          out_of_order: boolean;
          plan_day_id: string | null;
          plan_id: string | null;
          started_at: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          cycle_number?: number | null;
          day_name?: string | null;
          deleted_at?: string | null;
          ended_at?: string | null;
          feeling?: number | null;
          id?: string;
          notes?: string | null;
          out_of_order?: boolean;
          plan_day_id?: string | null;
          plan_id?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          cycle_number?: number | null;
          day_name?: string | null;
          deleted_at?: string | null;
          ended_at?: string | null;
          feeling?: number | null;
          id?: string;
          notes?: string | null;
          out_of_order?: boolean;
          plan_day_id?: string | null;
          plan_id?: string | null;
          started_at?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sessions_plan_day_id_fkey';
            columns: ['plan_day_id'];
            isOneToOne: false;
            referencedRelation: 'plan_days';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_sessions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'workout_plans';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      daily_nutrition_totals: {
        Row: {
          carbs_g: number | null;
          day: string | null;
          fat_g: number | null;
          kcal: number | null;
          protein_g: number | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      exercise_e1rm_daily: {
        Row: {
          best_e1rm_kg: number | null;
          best_weight_kg: number | null;
          day: string | null;
          exercise_id: string | null;
          sets: number | null;
          user_id: string | null;
          volume_kg: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'session_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_records: {
        Row: {
          actual_max_kg: number | null;
          best_duration_s: number | null;
          best_reps: number | null;
          completed_sets: number | null;
          est_1rm_kg: number | null;
          exercise_id: string | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'session_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      clear_my_online_data: { Args: never; Returns: undefined };
      epley_1rm: { Args: { reps: number; weight_kg: number }; Returns: number };
      is_premium: { Args: never; Returns: boolean };
      last_sets: {
        Args: { p_exercise_ids: string[] };
        Returns: {
          distance_m: number;
          duration_s: number;
          exercise_id: string;
          reps: number;
          set_index: number;
          weight_kg: number;
        }[];
      };
      strength_by_exercise: {
        Args: { p_from: string; p_to?: string };
        Returns: {
          exercise_id: string;
          first_e1rm_kg: number;
          last_e1rm_kg: number;
          muscle_group: string;
          pct_change: number;
          sets: number;
        }[];
      };
      strength_by_group: {
        Args: { p_from: string; p_to?: string };
        Returns: {
          muscle_group: string;
          pct_change: number;
          sets: number;
        }[];
      };
      strength_group: { Args: { muscle: string }; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
