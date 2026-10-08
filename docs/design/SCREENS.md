# Screen index

Every screen of the free version, designed on the canvas. Source files are in `screens/` (one `.dc.html` per screen, 390×844 px phone frame).
File names are Italian working names; the English name and the proposed Expo Router route are the ones to use in code.

## Today

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/Main.dc.html` | Today | `app/(tabs)/index.tsx` | tab root |

## Workout

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/CreaEsercizio.dc.html` | Create exercise | `app/(modals)/exercise/new.tsx` | modal |
| `screens/EditorScheda.dc.html` | Day editor | `app/(modals)/plan-day/[dayId].tsx` | modal |
| `screens/EsercizioDettaglio.dc.html` | Exercise detail | `app/(tabs)/train/exercise/[exerciseId].tsx` | push |
| `screens/Libreria.dc.html` | Exercise library | `app/(tabs)/train/library.tsx` | push |
| `screens/Riepilogo.dc.html` | Session summary | `app/session/[sessionId]/summary.tsx` | full screen |
| `screens/SchedaDettaglio.dc.html` | Plan detail | `app/(tabs)/train/plan/[planId].tsx` | push |
| `screens/Schede.dc.html` | My plans | `app/(tabs)/train/index.tsx` | tab root |
| `screens/SelezionaEsercizi.dc.html` | Pick exercises | `app/(modals)/exercise-picker.tsx` | modal |
| `screens/Sessione.dc.html` | Active session | `app/session/[sessionId]/index.tsx` | full screen, no tab bar |
| `screens/SessioneDettaglio.dc.html` | Session detail | `app/(tabs)/train/history/[sessionId].tsx` | push |
| `screens/SessioneFine.dc.html` | Finish confirmation | `sheet inside app/session/[sessionId]` | bottom sheet |
| `screens/Storico.dc.html` | History | `app/(tabs)/train/history/index.tsx` | push |

## Diet

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/AlimentoDettaglio.dc.html` | Food detail / log entry | `app/(modals)/food/[foodId].tsx` | modal |
| `screens/Cerca.dc.html` | Food search | `app/(modals)/food-search.tsx?meal=` | modal |
| `screens/CreaAlimento.dc.html` | Create food | `app/(modals)/food/new.tsx` | modal |
| `screens/Diario.dc.html` | Food log (count-foods mode) | `app/(tabs)/diet/index.tsx` | tab root |
| `screens/DiarioPiano.dc.html` | Food log (fixed-meals mode) | `app/(tabs)/diet/index.tsx` | tab root, other mode |
| `screens/ObiettiviDieta.dc.html` | Goals & tracking mode | `app/(modals)/diet-goals.tsx` | modal |
| `screens/PastoModifica.dc.html` | Adjust a fixed meal | `sheet inside the diet tab` | bottom sheet |
| `screens/PianoPastiEditor.dc.html` | Fixed meals editor | `app/(modals)/fixed-meals.tsx` | modal |
| `screens/RicettaDettaglio.dc.html` | Recipe editor | `app/(modals)/recipe/[recipeId].tsx` | modal |
| `screens/Ricette.dc.html` | Recipes | `app/(tabs)/diet/recipes.tsx` | push |
| `screens/Scanner.dc.html` | Barcode scanner | `app/(modals)/scanner.tsx` | modal, camera |

## Progress

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/CheckIn.dc.html` | Check-in | `app/(modals)/check-in.tsx` | modal |
| `screens/Composizione.dc.html` | Body fat & measurements | `app/(tabs)/progress/body.tsx` | push |
| `screens/ForzaGruppi.dc.html` | Strength | `app/(tabs)/progress/strength/index.tsx` | push |
| `screens/ForzaGruppo.dc.html` | Muscle group detail | `app/(tabs)/progress/strength/[group].tsx` | push |
| `screens/Foto.dc.html` | Progress photos | `app/(tabs)/progress/photos/index.tsx` | push |
| `screens/FotoConfronta.dc.html` | Compare photos | `app/(tabs)/progress/photos/compare.tsx` | push |
| `screens/Peso.dc.html` | Body weight | `app/(tabs)/progress/weight.tsx` | push |
| `screens/Progressi.dc.html` | Progress | `app/(tabs)/progress/index.tsx` | tab root |

## Profile

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/Accessibilita.dc.html` | Accessibility | `app/(tabs)/profile/accessibility.tsx` | push |
| `screens/Impostazioni.dc.html` | Settings (units, look, notifications) | `app/(tabs)/profile/settings.tsx` | push |
| `screens/Profilo.dc.html` | Profile | `app/(tabs)/profile/index.tsx` | tab root |
| `screens/ProfiloDati.dc.html` | Privacy & data | `app/(tabs)/profile/privacy.tsx` | push |
| `screens/ProfiloInfo.dc.html` | Personal info | `app/(modals)/profile-edit.tsx` | modal |

## Components

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/ExerciseIcon.dc.html` | Exercise image slot (component) | `components/ExerciseImage.tsx` | component |

## Reference

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/ExerciseIcons.dc.html` | Exercise images to provide | `—` | reference sheet |

## Maps

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/MappaAllenamento.dc.html` | Workout navigation map | `—` | reference diagram |
| `screens/MappaDieta.dc.html` | Diet navigation map | `—` | reference diagram |
| `screens/MappaProgressiProfilo.dc.html` | Progress & profile navigation map | `—` | reference diagram |

