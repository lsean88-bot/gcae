# Connect Claude or ChatGPT

You can use the app with no model. Connect a model only when you want it to interpret a result or rewrite tone.

The model does not run the calculation. The app does. The model reads the packet and writes a note. A person decides.

## Which key you need

| What you already have | Is that enough? | What to get instead |
| --- | --- | --- |
| Claude.ai chat login | No | An API key from console.anthropic.com |
| Claude Pro or Team plan | No | The same API key page |
| ChatGPT Plus | No | An API key from platform.openai.com |
| A key starting with `sk-ant-` | Yes, for Claude | Paste it on Connect AI |
| A key starting with `sk-` from the OpenAI API site | Yes, for ChatGPT | Paste it on Connect AI |

## Connect Claude

1. Open the app.
2. Set **Acting as** to Amira Hassan, or your Group Chief Audit Executive.
3. Click **Connect AI**.
4. Open https://console.anthropic.com/settings/keys in a new tab.
5. Sign in. Add a payment method if the site asks. This is separate from Claude chat.
6. Click **Create key**.
7. Copy the whole key. It usually starts with `sk-ant-`.
8. Paste it into **Paste Claude API key**.
9. Click **Connect Claude**.
10. Wait. The app sends one short test message. If the key is wrong, nothing is saved.
11. When the pill says **Connected**, click **Use Claude for the harness** if that button is shown.
12. Click **Open Agent harness**, choose an engagement, and click **Run harness**.

The key is stored in the server database. It is not shown again. It is not written into the report.

## Connect ChatGPT

1. Open the app as the GCAE.
2. Click **Connect AI**.
3. Open https://platform.openai.com/api-keys in a new tab.
4. Click **Create new secret key**.
5. Copy the whole key.
6. Paste it into **Paste OpenAI API key**.
7. Click **Connect ChatGPT**.
8. Click **Use ChatGPT for the harness**.
9. Run the harness or open **Report studio** and click **Draft with ChatGPT**.

You may connect both. The harness uses the one you chose with **Use Claude** or **Use ChatGPT**.

## Use Claude.ai with no API key

This path does not spend API credit and does not store a key.

1. On **Agent harness**, click **Copy Claude constitution**.
2. In Claude.ai, create a Project.
3. Paste the constitution into the project instructions.
4. On **Report studio**, copy the prompt.
5. Paste that prompt into the Claude Project.
6. Copy Claude’s reply.
7. Paste it into **Paste the model reply**.
8. Click **File the pasted reply**.
9. Read it. If a number is not already in the file, do not save it.
10. Only the manager or GCAE clicks **Save into opinion draft**.

The same paste path works for a ChatGPT chat window.

## What the model is allowed to do

- Explain the assignment from the file.
- Describe a process only from the notes.
- Restate test results the tool already calculated.
- Draft a short briefing that starts with `MODEL DRAFT — NOT AN ISSUED OPINION`.
- Propose one kaizen lesson that tightens discipline.

## What the model is not allowed to do

- Issue the report.
- Approve materiality or a rating.
- Change a threshold, a population, or an original file.
- Close an action.
- Invent a figure, a date, a name, a cause, or a management response.
- Treat an indicator as proof of fraud.
- Waive an iron rule.

If a draft contains a figure that is not in the source, the app refuses to save it into the opinion.

## Disconnect

1. Open **Connect AI** as the GCAE.
2. Click **Disconnect** on Claude or ChatGPT.
3. The saved key is removed. Environment keys set by IT are not removed by that button. Ask IT to remove those from `.env` and restart.

## If connection fails

| Message | Meaning | What to do |
| --- | --- | --- |
| Only the GCAE can connect | You are acting as another role | Switch to Amira Hassan |
| That does not look like a full key | The paste was cut off | Paste the key again, with no spaces |
| Key was not accepted | The provider rejected it | Create a new API key. Do not paste a chat password |
| Model not found | The default model name is not on your account | Ask IT to set `ANTHROPIC_MODEL` or `OPENAI_MODEL` and restart |
| Claude is not connected | No key is saved | Repeat the Connect Claude steps |

## After you connect

1. Open **Agent harness**.
2. The pill should say the model is connected.
3. Click **Run harness** on a practice engagement first.
4. Read the specialist notes.
5. Open **UAT evidence** and run it again. The 32 checks do not require a model. They prove the calculations and the gates.
