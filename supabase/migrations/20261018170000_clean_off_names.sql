-- Open Food Facts names already saved as global foods get the same cleaning as new ones
-- (DECISIONS 84, `cleanOffText`): no control or invisible characters, no markup characters, one
-- line, at most 100 characters (brands 60). Only global rows from OFF; nobody's own foods.
update public.foods
set name = left(btrim(regexp_replace(
      regexp_replace(name, '[[:cntrl:]​-‏‪-‮⁠-⁩﻿<>{}`\[\]\\|]', ' ', 'g'),
      '\s+', ' ', 'g')), 100),
    brand = nullif(left(btrim(regexp_replace(
      regexp_replace(coalesce(brand, ''), '[[:cntrl:]​-‏‪-‮⁠-⁩﻿<>{}`\[\]\\|]', ' ', 'g'),
      '\s+', ' ', 'g')), 60), '')
where owner_id is null and source = 'off'
  and (length(name) > 100 or length(coalesce(brand, '')) > 60
       or name ~ '[[:cntrl:]​-‏‪-‮⁠-⁩﻿<>{}`\[\]\\|]'
       or coalesce(brand, '') ~ '[[:cntrl:]​-‏‪-‮⁠-⁩﻿<>{}`\[\]\\|]');
