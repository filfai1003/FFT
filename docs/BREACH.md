# Violazione dei dati personali: cosa fare

Procedura interna di FFT (GDPR art. 33 e 34). Titolare: Filippo Faiella, filfai1003@gmail.com.
Il **registro delle violazioni** con i dettagli di ogni caso va tenuto **fuori da questo repository**
(il repository è pubblico): un documento privato, per esempio nel tuo Drive.

## Cos'è una violazione

Qualsiasi evento che rende i dati degli utenti **leggibili da chi non deve**, **modificati** o
**persi / non disponibili**, anche per errore e anche senza un attacco. Esempi per FFT:

- qualcuno entra nel pannello admin, nel database o nell'account Railway;
- trapela un segreto: `ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, la password del
  database, `BACKUP_KEY` insieme ai backup, `OPENROUTER_API_KEY`;
- un bug fa vedere a un utente i dati di un altro (regole RLS, sync, API/MCP, foto);
- dati cancellati o corrotti sul server senza un backup utilizzabile;
- un fornitore (Railway, OpenRouter) ti avvisa di una violazione che tocca i tuoi dati;
- un'email con dati personali mandata alla persona sbagliata.

Non è una violazione: un utente che perde il proprio telefono o il proprio token API (è suo), un
tentativo di accesso bloccato.

## Il tempo

Hai **72 ore** per avvisare il Garante, contate da quando **sai ragionevolmente** che c'è una
violazione (non da quando è successa). Se non hai ancora tutti i dettagli, si notifica entro 72 ore
quello che si sa e si integra dopo.

## Passi

### 1. Annota subito (5 minuti)
Data e ora in cui te ne sei accorto, come, cosa hai visto. Fai screenshot e copia i log
(Railway → servizio → Logs; pannello admin → Problems, Change log). Non cancellare niente.

### 2. Ferma la perdita (prima ora)
Solo quello che serve per il caso:

| Problema | Cosa fare |
|---|---|
| Pannello admin violato o `ADMIN_PASSWORD` trapelata | Railway → `admin` → Variables: nuova `ADMIN_PASSWORD`. Se serve, togli il dominio pubblico del servizio `admin` |
| `SUPABASE_SERVICE_ROLE_KEY` o `JWT_SECRET` trapelati | Nuovo `JWT_SECRET` e nuove chiavi anon e service-role su Railway (tutti i servizi che le usano). Attenzione: la chiave anon è dentro l'app (variabile EAS), quindi serve un aggiornamento dell'app; tutti gli utenti dovranno rientrare |
| Password del database trapelata | Cambiala sul servizio Postgres e aggiorna `DATABASE_URL` nei servizi che la usano |
| Token API usati male | Pannello admin → All data → `api_tokens`: revoca (deleted_at) i token coinvolti |
| `OPENROUTER_API_KEY` trapelata | Revocala su openrouter.ai e mettine una nuova sul servizio `api` |
| Bug che mostra dati di altri | Se possibile spegni la funzione (rollback del deploy su Railway → Deployments → Rollback), poi correggi |
| Account Railway o GitHub violato | Cambia password, attiva/controlla la 2FA, chiudi le sessioni aperte, controlla i deploy recenti |
| Dati persi | Ripristino dal backup (docs/DEPLOY.md → Backups) |

### 3. Capisci la gravità (entro 24 ore)
Rispondi per scritto:
- **Quali dati**: account (email), profilo, peso e misure, dieta, allenamenti, foto, conversazioni AI?
  Peso, misure, dieta e foto sono **dati sulla salute**: rischio più alto.
- **Quanti utenti** (pannello admin → People; query nel pannello).
- **Tipo**: letti da altri (riservatezza), modificati (integrità), persi (disponibilità).
- **Ancora in corso?** Bloccata?
- **Conseguenze possibili** per le persone: imbarazzo, discriminazione, furto d'identità, phishing.

### 4. Decidi chi avvisare

| Rischio per le persone | Garante (entro 72 h) | Utenti |
|---|---|---|
| Improbabile (es. dati cifrati e chiave al sicuro, bloccato subito, nessun dato letto) | No, ma registralo | No |
| Possibile | **Sì** | Se il rischio è alto |
| Alto (es. dati sulla salute letti da estranei, password o email esposte) | **Sì** | **Sì, senza ritardo** |

Nel dubbio, notifica il Garante.

### 5. Notifica al Garante
Procedura online sul sito del Garante (garanteprivacy.it → "Data breach" / notifica violazione),
con il modulo ufficiale. Servono:
- titolare e contatto (Filippo Faiella, filfai1003@gmail.com);
- quando è successo e quando te ne sei accorto;
- natura della violazione, categorie e numero approssimativo di persone e di dati;
- conseguenze probabili;
- misure prese e previste (passo 2 e dopo);
- se e come hai avvisato gli utenti.

Conserva la ricevuta.

### 6. Avviso agli utenti (se il rischio è alto)
Email a ciascun utente coinvolto (e, se l'email non è possibile, un avviso nell'app o sul sito).
Testo semplice, senza tecnicismi:

> **Oggetto: Avviso di sicurezza sul tuo account FFT**
>
> Ciao, il [data] abbiamo scoperto che [cosa è successo, in una frase]. Sono stati coinvolti questi
> tuoi dati: [elenco]. Abbiamo già [cosa hai fatto]. Ti consigliamo di [cambiare la password /
> fare attenzione a email sospette / …]. Per qualsiasi domanda scrivi a filfai1003@gmail.com.
> Filippo Faiella, FFT

> **Subject: Security notice about your FFT account**
>
> Hi, on [date] we found that [what happened, one sentence]. These data of yours were involved:
> [list]. We have already [what was done]. We recommend that you [change your password / watch for
> suspicious emails / …]. For any question write to filfai1003@gmail.com.
> Filippo Faiella, FFT

### 7. Fornitori
- Se la violazione nasce da un fornitore, chiedigli per iscritto i dettagli: Railway
  privacy@railway.com (DPA firmato, §8), OpenRouter dal loro supporto.
- Se tocca loro, avvisali.

### 8. Registra e impara (sempre, anche se non notifichi)
Nel registro privato: data, cosa è successo, dati e persone coinvolti, conseguenze, decisioni prese
(e perché hai notificato o no), misure. Poi la correzione nel codice o nella configurazione, con un
test se possibile.

## Dove guardare per accorgersene
- Pannello admin → Overview (ultimo backup) e **Problems** (errori, backup falliti).
- Email di Railway, GitHub, OpenRouter.
- Railway → Logs (servizi `api`, `auth`, `backend`, `admin`).
- Segnalazioni degli utenti a filfai1003@gmail.com.
