# Personal data breach: what to do

FFT internal procedure (GDPR art. 33 and 34). Controller: Filippo Faiella, filfai1003@gmail.com.
The **breach register** with the details of each case must be kept **outside this repository**
(the repository is public): a private document, for example in your Drive.

## What a breach is

Any event that makes users' data **readable by someone who should not see it**, **modified** or
**lost / unavailable**, even by mistake and even without an attack. Examples for FFT:

- someone gets into the admin panel, the database or the Railway account;
- a secret leaks: `ADMIN_PASSWORD` (with `ADMIN_TOTP_SECRET`), `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, the database
  password, `BACKUP_KEY` together with the backups, `OPENROUTER_API_KEY`, the GitHub secrets
  `EXPO_TOKEN`, `EXPO_UPDATES_PRIVATE_KEY` and `APK_UPLOAD_TOKEN` (they can change the app people
  install);
- a bug lets a user see another user's data (RLS rules, sync, API/MCP, photos);
- data deleted or corrupted on the server without a usable backup;
- a provider (Railway, OpenRouter) tells you about a breach that affects your data;
- an email with personal data sent to the wrong person.

Not a breach: a user who loses their own phone or their own API token (it is theirs), a blocked
sign-in attempt.

## The deadline

You have **72 hours** to notify the Garante (the Italian supervisory authority, Garante per la
protezione dei dati personali), counted from when you **become reasonably aware** that there is a
breach (not from when it happened). If you do not have all the details yet, notify what you know
within 72 hours and add the rest later.

## Steps

### 1. Write it down at once (5 minutes)
Date and time you noticed it, how, what you saw. Take screenshots and copy the logs
(Railway → service → Logs; admin panel → Problems, Change log). Do not delete anything.

### 2. Stop the loss (first hour)
Only what the case needs:

| Problem | What to do |
|---|---|
| Admin panel breached or `ADMIN_PASSWORD` leaked | Railway → `admin` → Variables: new `ADMIN_PASSWORD` and new `ADMIN_TOTP_SECRET` (then add it again to the authenticator app). If needed, remove the public domain of the `admin` service |
| `SUPABASE_SERVICE_ROLE_KEY` or `JWT_SECRET` leaked | New `JWT_SECRET` and new anon and service-role keys on Railway (all the services that use them). Careful: the anon key is inside the app (EAS variable), so an app update is needed; all users will have to sign in again |
| `APK_UPLOAD_TOKEN` leaked (GitHub secret) | It can publish, as the install page's APK, any file at an address of the form `https://expo.dev/artifacts/eas/<id>.apk` that looks like an APK (zip with an `AndroidManifest.xml`, at most 300 MB). The server cannot tell whether that build is of our EAS project: anyone with the token can put their own EAS build there, so treat it as serious (people would install it). Turn publishing off at once (remove `APK_UPLOAD_TOKEN_SHA256` on the `api` service), put our newest build back by hand (DEPLOY.md), then make a new token: new GitHub secret `APK_UPLOAD_TOKEN`, new `APK_UPLOAD_TOKEN_SHA256` on the `api` service (docs/DEPLOY.md → Publishing a new APK). Check that the APK on the install page is our newest build (compare its SHA-256 with the file from expo.dev → Builds) |
| `EXPO_TOKEN` leaked (GitHub secret) | Since DECISIONS 87 it is no longer enough to push code to installed phones: they accept only updates signed with the private key, which is not in EAS. It can still start EAS builds (a new APK built from any code, which `Publish APK` would put on the install page as the newest build) and publish unsigned updates (phones refuse them). Revoke it on expo.dev (Account settings → Access tokens), make a new one and set the GitHub secret `EXPO_TOKEN` again; check expo.dev → Builds and Updates for anything we did not start, and that the APK on the install page is our build |
| Update signing key leaked (`EXPO_UPDATES_PRIVATE_KEY` or `.secrets/codesigning/private-key.pem`) | With an EAS token too, someone could push code that installed phones accept. Rotate the certificate (docs/DEPLOY.md → Signed updates → Key lost): new key pair, commit the new `certs/certificate.pem`, set the GitHub secret again. That changes the fingerprint, so a **new APK** is built: tell users to install it from the install page (the old APK keeps trusting the old key, so also revoke `EXPO_TOKEN` to stop anyone publishing to it) |
| GitHub Actions or a CI dependency compromised | No database or storage key is in GitHub any more (only `EXPO_TOKEN`, `EXPO_UPDATES_PRIVATE_KEY` and `APK_UPLOAD_TOKEN`): rotate all three (the signing key means a new APK, see above), check the recent EAS builds and updates (expo.dev) and the APK on the install page |
| Database password leaked | Change it on the Postgres service and update `DATABASE_URL` in the services that use it |
| API tokens misused | Admin panel → All data → `api_tokens`: revoke (deleted_at) the tokens involved |
| `OPENROUTER_API_KEY` leaked | Revoke it on openrouter.ai and put a new one on the `api` service |
| Bug that shows other people's data | If possible turn the feature off (roll back the deploy on Railway → Deployments → Rollback), then fix it |
| Railway or GitHub account breached | Change the password, turn on / check 2FA, close open sessions, check the recent deploys |
| Data lost | Restore from the backup (docs/DEPLOY.md → Backups) |

### 3. Understand how serious it is (within 24 hours)
Answer in writing:
- **Which data**: account (email), profile, weight and measurements, diet, workouts, photos, AI conversations?
  Weight, measurements, diet and photos are **health data**: higher risk.
- **How many users** (admin panel → People; query in the panel).
- **Type**: read by others (confidentiality), modified (integrity), lost (availability).
- **Still going on?** Stopped?
- **Possible consequences** for the people: embarrassment, discrimination, identity theft, phishing.

### 4. Decide who to notify

| Risk for the people | Garante (within 72 h) | Users |
|---|---|---|
| Unlikely (e.g. data encrypted and key safe, stopped at once, no data read) | No, but record it | No |
| Possible | **Yes** | If the risk is high |
| High (e.g. health data read by strangers, passwords or emails exposed) | **Yes** | **Yes, without delay** |

When in doubt, notify the Garante.

### 5. Notification to the Garante
Online procedure on the Garante's website (garanteprivacy.it → "Data breach" / breach
notification), with the official form. You need:
- controller and contact (Filippo Faiella, filfai1003@gmail.com);
- when it happened and when you noticed it;
- nature of the breach, categories and approximate number of people and of records;
- likely consequences;
- measures taken and planned (step 2 and after);
- whether and how you told the users.

Keep the receipt.

### 6. Notice to users (if the risk is high)
Email to each user involved (and, if email is not possible, a notice in the app or on the site).
Plain text, no jargon:

> **Subject: Security notice about your FFT account**
>
> Hi, on [date] we found that [what happened, one sentence]. These data of yours were involved:
> [list]. We have already [what was done]. We recommend that you [change your password / watch for
> suspicious emails / …]. For any question write to filfai1003@gmail.com.
> Filippo Faiella, FFT

### 7. Providers
- If the breach comes from a provider, ask them in writing for the details: Railway
  privacy@railway.com (signed DPA, §8), OpenRouter through their support.
- If it affects them, tell them.

### 8. Record and learn (always, even if you do not notify)
In the private register: date, what happened, data and people involved, consequences, decisions
taken (and why you notified or not), measures. Then the fix in the code or in the configuration,
with a test if possible.

## Where to look to notice it
- Admin panel → Overview (last backup) and **Problems** (errors, failed backups).
- Emails from Railway, GitHub, OpenRouter.
- Railway → Logs (services `api`, `auth`, `backend`, `admin`).
- User reports to filfai1003@gmail.com.
