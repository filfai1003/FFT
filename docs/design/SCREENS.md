# Screen index

Every screen of the free version, designed on the canvas. Source files are in `screens/` (one `.dc.html` per screen, 390×844 px phone frame).
The proposed Expo Router route is the one to use in code.

## Today

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/Main.dc.html` | Today | `app/(tabs)/index.tsx` | tab root |

## Workout

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/CreateExercise.dc.html` | Create exercise | `app/(modals)/exercise/new.tsx` | modal |
| `screens/DayEditor.dc.html` | Day editor | `app/(modals)/plan-day/[dayId].tsx` | modal |
| `screens/ExerciseDetail.dc.html` | Exercise detail | `app/(tabs)/train/exercise/[exerciseId].tsx` | push |
| `screens/ExerciseLibrary.dc.html` | Exercise library | `app/(tabs)/train/library.tsx` | push |
| `screens/SessionSummary.dc.html` | Session summary | `app/session/[sessionId]/summary.tsx` | full screen |
| `screens/PlanDetail.dc.html` | Plan detail | `app/(tabs)/train/plan/[planId].tsx` | push |
| `screens/Plans.dc.html` | My plans | `app/(tabs)/train/index.tsx` | tab root |
| `screens/ExercisePicker.dc.html` | Pick exercises | `app/(modals)/exercise-picker.tsx` | modal |
| `screens/ActiveSession.dc.html` | Active session | `app/session/[sessionId]/index.tsx` | full screen, no tab bar |
| `screens/SessionDetail.dc.html` | Session detail | `app/(tabs)/train/history/[sessionId].tsx` | push |
| `screens/FinishConfirmation.dc.html` | Finish confirmation | `sheet inside app/session/[sessionId]` | bottom sheet |
| `screens/History.dc.html` | History | `app/(tabs)/train/history/index.tsx` | push |

## Diet

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/FoodDetail.dc.html` | Food detail / log entry | `app/(modals)/food/[foodId].tsx` | modal |
| `screens/FoodSearch.dc.html` | Food search | `app/(modals)/food-search.tsx?meal=` | modal |
| `screens/CreateFood.dc.html` | Create food | `app/(modals)/food/new.tsx` | modal |
| `screens/FoodLog.dc.html` | Food log (count-foods mode) | `app/(tabs)/diet/index.tsx` | tab root |
| `screens/FoodLogFixed.dc.html` | Food log (fixed-meals mode) | `app/(tabs)/diet/index.tsx` | tab root, other mode |
| `screens/DietGoals.dc.html` | Goals & tracking mode | `app/(modals)/diet-goals.tsx` | modal |
| `screens/AdjustMeal.dc.html` | Adjust a fixed meal | `sheet inside the diet tab` | bottom sheet |
| `screens/FixedMealsEditor.dc.html` | Fixed meals editor | `app/(modals)/fixed-meals.tsx` | modal |
| `screens/RecipeEditor.dc.html` | Recipe editor | `app/(modals)/recipe/[recipeId].tsx` | modal |
| `screens/Recipes.dc.html` | Recipes | `app/(tabs)/diet/recipes.tsx` | push |
| `screens/Scanner.dc.html` | Barcode scanner | `app/(modals)/scanner.tsx` | modal, camera |

## Progress

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/CheckIn.dc.html` | Check-in | `app/(modals)/check-in.tsx` | modal |
| `screens/BodyComposition.dc.html` | Body fat & measurements | `app/(tabs)/progress/body.tsx` | push |
| `screens/Strength.dc.html` | Strength | `app/(tabs)/progress/strength/index.tsx` | push |
| `screens/MuscleGroup.dc.html` | Muscle group detail | `app/(tabs)/progress/strength/[group].tsx` | push |
| `screens/Photos.dc.html` | Progress photos | `app/(tabs)/progress/photos/index.tsx` | push |
| `screens/ComparePhotos.dc.html` | Compare photos | `app/(tabs)/progress/photos/compare.tsx` | push |
| `screens/BodyWeight.dc.html` | Body weight | `app/(tabs)/progress/weight.tsx` | push |
| `screens/Progress.dc.html` | Progress | `app/(tabs)/progress/index.tsx` | tab root |

## Profile

| File | Screen | Proposed route | Presentation |
|---|---|---|---|
| `screens/Accessibility.dc.html` | Accessibility | `app/(tabs)/profile/accessibility.tsx` | push |
| `screens/Settings.dc.html` | Settings (units, look, notifications) | `app/(tabs)/profile/settings.tsx` | push |
| `screens/Profile.dc.html` | Profile | `app/(tabs)/profile/index.tsx` | tab root |
| `screens/PrivacyData.dc.html` | Privacy & data | `app/(tabs)/profile/privacy.tsx` | push |
| `screens/PersonalInfo.dc.html` | Personal info | `app/(modals)/profile-edit.tsx` | modal |

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
| `screens/WorkoutMap.dc.html` | Workout navigation map | `—` | reference diagram |
| `screens/DietMap.dc.html` | Diet navigation map | `—` | reference diagram |
| `screens/ProgressProfileMap.dc.html` | Progress & profile navigation map | `—` | reference diagram |

