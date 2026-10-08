# Progetto: app di allenamento e dieta (SaaS freemium)

Documento di riferimento completo. Tutte le decisioni di prodotto, design e dati prese in fase di progettazione. Il design approvato è in `docs/design/` e ha la precedenza su qualsiasi interpretazione personale.

---

## 1. Prodotto

App per gestire **allenamento, dieta e progressi**, modello **freemium**.

- **Gratuito (lo costruiamo ora, deve essere completo):** schede e sessioni di allenamento, dieta in due modalità, progressi (forza, peso, body fat, misure, foto), profilo e impostazioni.
- **Premium (NON ora, ma l'architettura deve prevederlo):** widget, integrazioni (Apple Health, Health Connect, Garmin, Strava), piani generati con IA, marketplace di trainer e nutrizionisti verificati (condivisione di schede, dieta, dati, foto check, chat).

Vincoli da non dimenticare:
- In Italia i personal trainer non possono prescrivere diete: nel marketplace futuro servono ruoli distinti (trainer / nutrizionista) con verifica dei titoli.
- Peso, dieta e foto sono **dati sanitari (GDPR art. 9)**: consenso esplicito e revocabile, crittografia, esportazione e cancellazione completa.
- Limiti di sicurezza sulla dieta: niente target sotto 1500 kcal né deficit oltre il 25% (vale anche per i futuri piani IA).

**Lingua dell'interfaccia: inglese.** Tutti i testi passano da un sistema i18n (niente stringhe hardcoded) per aggiungere altre lingue. Codice, tabelle e variabili in inglese.

---

## 2. Stack

- **App:** Expo (React Native) + TypeScript strict + Expo Router. iOS e Android prima, web dalla stessa base.
- **Backend:** Supabase (Postgres, Auth, Storage, Row Level Security). Migrazioni SQL versionate in `supabase/migrations`, sviluppo locale con Supabase CLI.
- **Dati client:** TanStack Query con aggiornamenti ottimistici. **La sessione di allenamento funziona offline**: salvataggio locale a ogni modifica e sync al ritorno della rete. Per la Fase 1 basta una coda locale persistente; proponi tu se e quando passare a una soluzione local-first (PowerSync, expo-sqlite + sync).
- **Alimenti:** Open Food Facts come sorgente esterna. Ciò che non è nel nostro DB si cerca lì e si salva in `foods` con `source = 'off'`; le ricerche successive restano interne.
- **Font:** Doto, Space Grotesk, Space Mono (Google Fonts, licenza OFL). Usa i pacchetti `@expo-google-fonts/*` se esistono per tutti e tre, altrimenti includi i TTF nel repo.
- **Qualità:** ESLint + Prettier; test per la logica di dominio (calorie e macro, fabbisogno, massimali, punteggio forza, rotazione schede, conversioni di unità).

Se una scelta ti sembra sbagliata, dimmelo e spiega perché **prima** di cambiarla.

---

## 3. Design: dove guardare

- `docs/design/screens/*.dc.html`: **un file per schermata**, telefono 390×844. È HTML con stili inline: colori, dimensioni, testi e struttura sono **la fonte di verità**. I tag `<sc-for>`, `<sc-if>` e `{{segnaposto}}` sono template: i dati di esempio stanno nella funzione `renderVals()` dello script in fondo al file. `<dc-import name="ExerciseIcon">` è il componente immagine esercizio (`ExerciseIcon.dc.html`). **Non copiare l'HTML**: ricostruisci in React Native usando i token.
- `docs/design/SCREENS.md`: indice delle schermate con nome inglese, route Expo Router proposta e tipo di presentazione (tab, push, modal, sheet).
- `docs/design/NAVIGATION.md`: grafo di navigazione (quale controllo porta a quale schermata).
- `docs/design/tokens.json`: colori, font, scala tipografica, raggi, spaziature, misure di tocco, aree sicure e componenti base.
- `docs/design/screenshots/` (se presente): PNG esportati dal canvas per un riferimento visivo rapido.
- Le tre mappe (`Mappa*.dc.html`) sono diagrammi di riferimento, non schermate.

### Linguaggio visivo (ispirato a Nothing)
Monocromatico, nero puro con una griglia di puntini appena visibile, caratteri a matrice di punti per numeri e titoli, **un solo accento** (rosso #D71921 di default, sceglibile dall'utente). Il componente distintivo è la **barra a puntini**, usata per calorie, macro, acqua, recupero e progressione della sessione, più i grafici a colonne di puntini. **Niente blocchi bianchi pieni**: la selezione si indica con il bordo bianco.

### Regole di ergonomia e accessibilità (obbligatorie)
1. **Target di tocco ≥ 44×44** su ogni controllo (Apple 44 pt, Android 48 dp; WCAG 2.2 minimo 24 px). Pulsanti primari alti 56, righe di elenco ≥ 52.
2. **Aree sicure** sempre rispettate (`react-native-safe-area-context`). Niente finta status bar.
3. **Zona del pollice:** l'azione principale di form ed editor è un pulsante grande fissato in basso con un'etichetta precisa ("Save day", "Save check-in"…). "Cancel"/chiudi stanno in alto a sinistra. Le azioni rischiose (es. "Finish" della sessione) restano volutamente in alto; le distruttive sono in fondo alla pagina, mai fissate e sempre con conferma.
4. **Contrasto:** testo ≥ 4.5:1; bordi e stati dei controlli ≥ 3:1 (bordo controlli #6E6E6E). Testo principale #F2F2F2 su nero.
5. **Tipografia:** minimo 11 px; campi di input a 16 px; maiuscolo solo per etichette brevi; supporto alle dimensioni di testo di sistema (Dynamic Type / font scale) senza rompere i layout.
6. **Barra di navigazione e barre d'azione fisse in basso**: il contenuto scorre sotto.
7. **Anti-errore:** ogni azione importante si può annullare (toast con UNDO per ~5 s: serie spuntata, pasto spuntato, elemento eliminato). Spostarsi tra esercizi non perde mai dati. "Finish" chiede conferma.
8. **Impostazioni di accessibilità rispettate in tutta l'app** (vedi §5.5): testo più grande e in grassetto, numeri senza matrice di punti, contrasto alto, meno movimento, vibrazione, modalità una mano, conto alla rovescia vocale.
9. Ogni controllo con sola icona ha un'etichetta per screen reader. Mai usare solo il colore per comunicare uno stato.

---

## 4. Navigazione

Barra in basso con 5 tab: **Today · Train · Diet · Progress · Profile** (etichette Space Mono maiuscole; la tab attiva è bianca con un puntino accento sotto).

- La barra è visibile nelle pagine di consultazione e nascosta in quelle di modifica o in corso (editor, picker, sessione attiva, riepilogo, check-in, scanner).
- La sessione attiva si può ridurre (freccia giù): continua in background e si riprende da Today o Train.
- Grafo completo in `docs/design/NAVIGATION.md`.

---

## 5. Funzionalità e regole

### 5.1 Today (`Main`)
Calorie rimanenti (barra a puntini) e macro; allenamento di oggi con "Start" e "Train a different day"; azioni rapide per pasto, peso e acqua.

### 5.2 Train
**Schermate:** My plans, Plan detail, Day editor, Pick exercises, Create exercise, Exercise library, Exercise detail, Active session, Finish confirmation, Session summary, History, Session detail.

**Rotazione della scheda e allenamenti fuori ordine**
- Una scheda ha N giorni ordinati. Un **ciclo** è completo quando ogni giorno è stato fatto una volta.
- Il giorno suggerito ("Up next") è **il primo giorno, nell'ordine della scheda, non ancora fatto nel ciclo corrente**.
- L'utente può avviare **qualsiasi giorno in qualsiasi momento** (pulsante play su ogni giorno, "Train a different day") oppure un **Empty workout**. Un giorno fatto fuori ordine conta come fatto nel ciclo e viene segnato "Out of order" nello storico. Esempio: ciclo Pull, Push, Legs, Upper; fatti Pull e poi Legs, quindi "Up next" resta Push.
- Quando tutti i giorni sono fatti, inizia il ciclo successivo.

**Sessione attiva:** carichi precompilati con la sessione precedente; il timer di recupero parte alla spunta di una serie; Previous/Next sempre in basso; salvataggio locale continuo; ripresa dopo crash o chiusura.

**Massimali (per esercizio)**
- **Actual max:** il peso più alto mai registrato in una serie completata, a prescindere dalle ripetizioni.
- **Estimated 1RM:** formula di Epley, `peso × (1 + reps / 30)`, calcolata per ogni serie completata con reps ≤ 12 (oltre è inaffidabile, quindi si ignora); si tiene il valore più alto. Con reps = 1 vale il peso stesso.
- Nel dettaglio esercizio si vedono entrambi; il grafico passa da uno all'altro. I record del riepilogo distinguono "NEW MAX" da "NEW EST. 1RM".

**Immagini esercizi:** ogni esercizio ha un campo immagine (quadrata). Le immagini degli esercizi principali le fornisce il proprietario del progetto (elenco e nomi file in `ExerciseIcons.dc.html`, formato 512×512 PNG con sfondo scuro o trasparente). Senza immagine si mostra il riquadro tratteggiato. Anche gli esercizi creati dall'utente possono avere un'immagine.

### 5.3 Diet
**Due modalità**, scelte in onboarding e modificabili da "Goals & mode":
1. **Count foods** (`Diario`): diario per pasto; ricerca, barcode, porzioni, ricette, alimenti personalizzati.
2. **Fixed meals** (`DiarioPiano`): pasti preimpostati con kcal/macro e descrizione; ogni giorno si spunta il pasto fatto. Toccando il pasto si apre **Adjust a meal**: mangiato come previsto / quantità diversa (valori reali) / registra gli alimenti per quel pasto / saltato. Vale solo per quel giorno.

Le due modalità condividono obiettivi, totali, grafici e Today.

**Schermate:** Food log ×2, Food search (Results / Recent / Mine / Recipes), Barcode scanner, Food detail, Create food, Recipes, Recipe editor, Goals & mode, Fixed meals editor, Adjust a meal.

**Regole:**
- Ogni voce registrata **copia** i valori nutrizionali al momento dell'inserimento.
- Le ricette calcolano kcal e macro per porzione dagli ingredienti.
- Il fabbisogno è calcolato con Mifflin-St Jeor × fattore di attività; l'utente lo può modificare entro i limiti di sicurezza; opzione "Higher target on training days" (+ carboidrati quando c'è una sessione registrata).
- "Auto-split" ripartisce il target sui pasti fissi.

### 5.4 Progress
**Schermate:** Progress (panoramica con periodo 4 WK / 12 WK / 1 YR / ALL), Strength, Muscle group detail, Body weight, Body fat & measurements, Photos, Compare photos, Check-in.

- **Strength score (generale):** media della variazione % dell'Estimated 1RM di ogni esercizio allenato nel periodo (ultimo valore rispetto al primo del periodo), **pesata per il numero di serie** di quell'esercizio.
- **Per gruppo muscolare:** stessa formula sugli esercizi il cui *muscolo principale* è quel gruppo. Gruppi: Chest, Back, Shoulders, Legs, Arms, Core.
- **Per esercizio:** variazione dell'Estimated 1RM (prima → ora).
- **Peso:** grafico delle medie settimanali, media mobile di 7 giorni, obiettivo con barra a puntini.
- **Body fat:** percentuale, massa magra e grassa calcolate dal peso, metodo di misura salvato (bilancia, plicometro, stima con metro). Misure: vita, fianchi, petto, braccio, coscia.
- **Foto:** pose front / side / back per check-in; confronto affiancato o a scorrimento; private (bucket privato con URL firmati), sfocate finché non le si tocca e bloccabili con Face ID o codice. La fotocamera mostra il contorno della foto precedente.
- **Check-in:** peso, body fat, misure, 3 foto e note; tutto facoltativo.

### 5.5 Profile
**Schermate:** Profile, Personal info, Settings, Accessibility, Privacy & data. "Diet goals & mode" riusa la schermata della sezione Diet.

- **Personal info:** nome, data di nascita, altezza, sesso (per la formula), attività quotidiana, esperienza, dove ti alleni. Se cambiano, si **propongono** nuovi target ma non si applicano senza conferma.
- **Settings:** unità (kg/lb, cm/ft·in, kcal/kJ, inizio settimana), colore d'accento (6 opzioni), tema (Dark; Light e System previsti ma il tema chiaro non è ancora disegnato), lingua, notifiche (fine recupero, promemoria allenamento, check-in settimanale, pasti).
- **Accessibility:** dimensione del testo, testo in grassetto, numeri a matrice di punti on/off, contrasto alto, riduzione movimento, vibrazione, one-hand mode in palestra, conto alla rovescia vocale del recupero.
- **Privacy & data:** esportazione completa (ZIP: JSON + CSV + foto) e dei soli allenamenti in CSV; sfocatura e blocco delle foto; statistiche anonime (off di default); condivisione con un coach (premium, off); revoca del consenso ai dati sanitari; eliminazione dell'account (tutto rimosso entro 30 giorni, con conferma forte).

### 5.6 Onboarding (non ancora disegnato)
Registrazione (email, Apple, Google), obiettivo, dati fisici, attività ed esperienza, calcolo del fabbisogno, scelta della modalità dieta (nel caso dei pasti fissi, impostazione dei pasti con ripartizione proposta), consenso esplicito ai dati sanitari. **Proponi tu le schermate seguendo lo stesso design system e mostrale prima di implementarle.**

### 5.7 Premium (solo vetrina ora)
Card "Premium" nel profilo e righe premium disattivate. Nessuna funzione bloccata nel gratuito.

---

## 6. Base dati (Postgres / Supabase)

### Utente e impostazioni
- `profiles` (id = auth user id, name, birth_date, sex, height_cm, activity_level, experience, training_location, timezone, diet_mode `'tracking'|'fixed_meals'`, created_at)
- `user_settings` (user_id, weight_unit, length_unit, energy_unit, week_start, accent, theme, language, text_scale, bold_text, dot_numbers, high_contrast, reduce_motion, haptics, one_hand_mode, spoken_countdown, notifications jsonb)
- `consents` (id, user_id, type `'health_data'|'analytics'`, granted_at, withdrawn_at)

### Allenamento
- `exercises` (id, owner_id null = catalogo, name, primary_muscle, secondary_muscles text[], equipment, log_type `'weight_reps'|'reps'|'time'|'distance_time'`, image_path)
- `workout_plans` (id, user_id, name, goal, active, source `'manual'|'ai'|'trainer'`)
- `plan_days` (id, plan_id, position, name)
- `plan_exercises` (id, plan_day_id, exercise_id, position, target_sets, target_reps text, rest_s, notes)
- `workout_sessions` (id, user_id, plan_id null, plan_day_id null, cycle_number null, out_of_order bool, started_at, ended_at, feeling 1–5, notes, status `'active'|'done'|'discarded'`)
- `session_sets` (id, session_id, exercise_id, set_index, weight_kg, reps, duration_s, distance_m, completed_at)
- Viste: `exercise_records` (actual max, best Epley per esercizio), `strength_by_period` (punteggio generale e per gruppo).

### Alimentazione
- `foods` (id, owner_id null = globale, barcode, name, brand, kcal_100g, protein_100g, carbs_100g, sugars_100g, fat_100g, saturates_100g, fiber_100g, salt_100g, source `'off'|'custom'`, verified)
- `food_servings` (id, food_id, label, grams)
- `food_logs` (id, user_id, day, meal, food_id null, recipe_id null, grams | servings, kcal, protein_g, carbs_g, fat_g **copiati**)
- `recipes` (id, user_id, name, servings) + `recipe_items` (recipe_id, food_id, grams)
- `nutrition_goals` (id, user_id, valid_from, kcal, protein_g, carbs_g, fat_g, training_day_bonus_kcal)
- `fixed_meal_plans` (id, user_id, name, active, source) + `fixed_meals` (id, plan_id, position, name, kcal, protein_g, carbs_g, fat_g, description)
- `fixed_meal_checks` (id, user_id, day, fixed_meal_id, status `'done'|'adjusted'|'skipped'`, kcal, protein_g, carbs_g, fat_g **copiati**, checked_at)
- `water_logs` (id, user_id, day, ml)
- Vista `daily_nutrition_totals` = `food_logs` + `fixed_meal_checks` (done/adjusted) per giorno: Today, diario e grafici leggono solo da qui.

### Progressi
- `body_metrics` (id, user_id, day, weight_kg, body_fat_pct, bf_method, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm, notes)
- `progress_photos` (id, user_id, day, pose `'front'|'side'|'back'`, storage_path)

### Regole valide per tutte le tabelle
1. Catalogo e dati personali nella stessa tabella (`owner_id` null = pubblico). RLS: ognuno legge le righe pubbliche e le proprie, scrive solo le proprie.
2. Unità sempre metriche nel DB; le conversioni avvengono solo nell'interfaccia.
3. `day` è la data locale dell'utente, calcolata con il suo fuso orario al momento dell'inserimento.
4. Obiettivi con storico (`valid_from`).
5. Record e punteggi si calcolano con viste, non si salvano.
6. Pronto per sync offline: UUID generati dal client, `created_at`, `updated_at`, `deleted_at` ovunque.
7. Campo `source` su schede e piani (manual/ai/trainer). In futuro si aggiungono `coach_clients` e `messages` senza toccare le tabelle esistenti.
8. Foto ed immagini in bucket Storage: foto progressi in un **bucket privato** con URL firmati; immagini degli esercizi del catalogo in un bucket pubblico.
9. Indici sulle query frequenti: `food_logs(user_id, day)`, `session_sets(session_id)`, `session_sets(exercise_id)`, `foods(barcode)`, ricerca testuale su `foods.name` ed `exercises.name`.

---

## 7. Piano di sviluppo

- **Fase 0 – Fondamenta:** repo, Expo + TS + Expo Router, lint, Supabase locale, migrazione completa con RLS, seed degli esercizi (≥ 60 con muscoli e attrezzatura), **design system in codice** (token da `tokens.json`, font, componenti: Screen con safe area e sfondo a puntini, Card, Button, IconButton, Chip, Segmented, Toggle, Input, Stepper, DotBar, DotColumnChart, TabBar, BottomActionBar, Sheet, Toast con Undo, ExerciseImage) e una pagina di catalogo dei componenti per verificarli.
- **Fase 1 – Account e onboarding:** auth, proposta e implementazione dell'onboarding, calcolo del fabbisogno, consenso.
- **Fase 2 – Allenamento:** libreria, schede, editor, **sessione attiva offline**, rotazione dei cicli, riepilogo, storico, massimali.
- **Fase 3 – Dieta:** prima i pasti fissi (più semplici), poi conteggio alimenti, Open Food Facts e barcode, alimenti personalizzati, ricette, obiettivi.
- **Fase 4 – Today e Progress:** home, forza (generale, per gruppo, per esercizio), peso, body fat e misure, foto e confronto, check-in.
- **Fase 5 – Profilo e conformità:** impostazioni, accessibilità, esportazione, consensi, eliminazione dell'account.
- **Dopo:** tema chiaro, premium (abbonamenti, widget, integrazioni, IA), marketplace.

---

## 8. Come lavorare

1. **Non scrivere codice subito.** Leggi questo documento e `docs/design/` (almeno SCREENS.md, NAVIGATION.md, tokens.json e una manciata di schermate), poi rispondi con:
   - dubbi o punti da cambiare;
   - la struttura delle cartelle;
   - il piano dettagliato della **Fase 0** a passi piccoli e verificabili.
2. Aspetta la mia conferma. Poi procedi un passo alla volta: alla fine di ogni passo dimmi cosa hai fatto, come verificarlo e fai un commit.
3. Mantieni aggiornato `CLAUDE.md` con le regole essenziali (stack, comandi, convenzioni, token, regole DB, regole di ergonomia).
4. Per le decisioni costose da cambiare (sync, navigazione, auth, struttura dati) chiedimi prima.
5. Quando implementi una schermata, aprine il file `.dc.html` e rispetta testi, gerarchia, dimensioni e stati. Se qualcosa nel design è incoerente o impossibile, dimmelo invece di improvvisare.
6. Niente premium, IA o trainer ora, ma niente scelte che li rendano difficili.
7. Quando fai una scelta tecnica non ovvia, spiegala in due righe.
