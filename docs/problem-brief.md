# Confam: problem brief

**Team 4, K-Tech Fest, "Every Vote, Every Voice"**

**▶ [Watch the demo video (3:35)](https://drive.google.com/file/d/1W2PJHUGUODDTcSwBAaNOV5R_dVBmCklx/view?usp=sharing)** · [Live website](https://web-production-13f1563e.up.railway.app) · Call Confam: **+1 864 808 9401**

## The link we chose
**Voter information and misinformation**, plus visibility of polling staff on election morning. This is the first link in the voting chain (*inform voters → identify → move staff and materials → vote and count → transmit → disputes*). Every later link depends on people trusting what they hear.

## Why it matters
- **Rumours outrun the truth.** In 2023, Nigerian fact-checkers reported more election misinformation than in 2019, and their corrections reached people slowly, mostly in English text online (Reuters Institute, Dubawa).
- **Polling units move and voters aren't told in a way that works.** INEC's own answer in 2023 was a bulk text message and an SMS lookup that needed your voter ID number.
- **Late officials empty queues.** When nobody can say whether officials are coming, voters give up and go home.
- **Older and disabled voters have rights they're never told about**, like no queueing and a helper of their choice (Electoral Act 2026, s.54). Observers found the promised aids missing at most polling units.

## Who it affects
Voters with basic phones, voters who don't read English, older voters and people with disabilities, and the presiding officers, community leaders and party agents who are asked "is it true?" all day.

## Our answer
**Confam, a phone line.** Anyone calls one number and speaks their own language. Confam checks a rumour by **calling the presiding officer at that polling unit** and calls the voter back with the answer and who confirmed it. It **calls registered voters the moment INEC moves their polling unit**, tells anyone whether officials have arrived (from the officials' own check-ins), and helps elderly voters get to the front of the queue. INEC runs it from a live **control room**. No smartphone, data, app or reading needed.

## How it fits the wider process
```
Voter (any phone) ─call─► Confam voice agent ─► Confam backend ─call─► Presiding officer at the unit
       ▲                                          │   ▲                         │
       └──────────── callback with verdict ───────┘   └──── answer / check-in ──┘
                                                  │
                                       INEC control room (live)
                         moves voters, relocates units, watches verdicts, pauses calls
```
Full system sketch and design: [README](../README.md#how-it-works) · [ARCHITECTURE.md](../ARCHITECTURE.md)
