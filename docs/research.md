# Confam: research notes

Researched 2026-11-18. Each claim has a source link. Items marked **UNVERIFIED** need confirming before we depend on them.

## 1. The problem space (Nigeria, 2027 cycle)

- **Election timing.** INEC first set 20 Feb 2027 for the presidential and NASS polls, then revised the timetable after the Electoral Act 2026. Recent reports put the presidential poll on **16 Jan 2027**, about 8 weeks from today. Governorship dates differ between reports. → [AllAfrica: INEC reschedules](https://allafrica.com/stories/202602270088.html), [AllAfrica: Jan 16](https://allafrica.com/stories/202602270817.html), [Nairametrics: original Feb 20](https://nairametrics.com/2026/02/13/inec-fixes-february-20-2027-for-presidential-election/), [PLAC analysis](https://placng.org/i/wp-content/uploads/2026/03/The-2027-Electoral-Calendar-Legal-Timelines-Administrative-Choices-and-Implications_Full-Analysis.pdf)
- **Misinformation.** False information spread more in 2023 than in 2019. In 2023 a 12-member Nigeria Fact-checkers' Coalition (Dubawa, Africa Check, FactCheckHub, CDD, RoundCheck, ...) ran live election fact-checks with no donor funding. Some fact-checks were published as audio. Local-language translation over WhatsApp was planned but its outcome is unclear. Gap: verdicts reach people slowly, mostly in English and in text, and rarely reach basic-phone users. → [Reuters Institute](https://reutersinstitute.politics.ox.ac.uk/news/we-cant-do-alone-nigerian-fact-checkers-teamed-debunk-politicians-false-claims-years-election), [Dubawa live fact-check](https://dubawa.org/live-fact-check-dubawa-nfc-partners-monitor-mis-disinformation-in-nigerias-presidential-legislative-elections/), [Dubawa typology study](https://dubawa.org/a-typology-and-distribution-analysis-of-information-disorder-on-the-2023-general-elections-in-nigeria/?amp=1), [IJNet](https://ijnet.org/en/story/how-false-information-threatened-nigeria’s-presidential-election)
- **Polling-unit information.** INEC's PU locator is a web form (State → LGA → RA/ward → PU), and INEC itself calls its map directions "approximate". **We found no public INEC API.** IReV publishes photos of EC8A result sheets. It is not a collation system, and uploads were unreliable in Feb 2023. → [Nairametrics PU locator](https://nairametrics.com/2023/02/13/2023-election-how-to-confirm-your-polling-units-location-via-inec-portal), [INEC Election Technologies Handbook](https://www.inecnigeria.org/wp-content/uploads/INEC-Election-Technologies-Handbook.pdf), [Dubawa on IReV](https://dubawa.org/electronic-transmission-of-result-the-proposed-process-vs-reality-with-irev/), [INEC 2023 GE report](https://inecnigeria.org/wp-content/uploads/2024/02/2023-GENERAL-ELECTION-REPORT-1.pdf)
- **Accessibility.** INEC's framework promises braille ballot guides, magnifiers, large print and sign-language materials. In practice, observers found no braille guide at 60% of PUs and no magnifiers at 76%. 22% of PUs were on steps or in corridors. Blind voters got guides with no orientation. INEC has no reliable record of where voters with disabilities live. → [AllAfrica: 2027 disability inclusion](https://allafrica.com/stories/202601160088.html), [TheCable](https://www.thecable.ng/?p=880490), [Guardian NG](https://guardian.ng/news/visually-impaired-voters-decry-absence-of-braille-ballot-papers/), [NAN](https://nannews.ng/2023/03/04/group-urges-inec-to-intensify-training-on-voting-materials-for-pwds)

## 2. Comparable products (Nigerian voice AI)

[Insight7](https://insight7.io/voice-ai-agents-nigeria/), [VoiceAgents](https://usevoiceagent.ai/), [Maraba](https://maraba.ai/) and [Vociply](https://ng.vociply.com/ai-call-automation/nigeria) all sell Nigerian-language call agents for businesses. None of them targets election integrity, and none closes the loop of collecting a rumour, verifying it with people in the area, and calling voters back. Our edge is that loop plus proactive outbound calls.

## 3. Aethex AI (voice orchestration). Docs: https://developers.aethexai.com

- **API.** Base `https://api.aethexai.com/api/v1`, header `X-API-Key`. Default limits are 60 req/min and 10k req/day per key. A 429 response includes `Retry-After`.
- **Agents.** `POST/PATCH /agents` with `system_prompt`, `first_message`, `voice_id`, `language`, `llm_model`, `dynamic_variables` (`{{var}}` in prompts), guardrails, voicemail detection, `transfer_routes`, `webhook_url`, and `keypad_capture_enabled` (DTMF).
- **Custom tools (mid-call HTTP).** `POST /agents/:id/tools` takes `name`, `description`, `parameters_schema`, `endpoint_url` (HTTPS:443), `headers`, `response_mode` (`json`|`speak`). Aethex sends `{arguments, agent_id, conversation_id, call_id}`. The response limit is 32 KiB. There are **no retries**. Errors are passed to the LLM as `{"error": ...}`. **Timeout is 9 s.** One docs page says this is fixed and another says it can be set to 9–30 s, so we design for 9 s. For long tasks, the async pattern is to return `202` and later `POST /calls/:id/notes`. The agent waits up to 5 minutes for that note.
- **Bring-your-own LLM.** `POST /llm-credentials {provider:"custom", base_url, api_key}`, then set the agent's `llm_model: "custom:<model>"`. Aethex sends OpenAI-format streaming `/chat/completions` requests with `tools`. **The first token must arrive within 5 s, with no gap over 10 s.** After 5 failures, Aethex trips a 60 s breaker. This works for voice only, and Aethex still runs STT/TTS. You can also bring your own Anthropic/OpenAI key through LLM Keys.
- **Outbound.** `POST /calls/trigger {agent_id, to_number, from_number, dynamic_variables, metadata}` returns 202. `POST /calls/batch` takes 1–10,000 recipients with per-recipient `variables`, `start_at`, and `target_concurrency_limit`, and supports pause, resume, cancel and retry.
- **Telnyx integration.** `POST /integrations/telephony/carriers {provider:"telnyx", api_key}`, then `POST .../carriers/:id/connect {phone_number, agent_id}`. Aethex then provisions the Telnyx SIP connection itself, for both inbound and outbound. The SIP edge is `sip.aethexai.com:5060`.
- **Webhooks.** `call.ended` carries the full transcript, cost and metadata. `recording.ready` also exists. Requests are signed with `X-Aethex-Signature: t=..,v1=..`, an HMAC-SHA256 over `"<t>.<raw_body>"` with a 300 s tolerance. Delivery is at-least-once, so we dedupe on `event_id`.
- **Knowledge base.** Per-agent RAG (`/agents/:id/knowledge-base`), tunable with `rag_top_k` and `rag_min_score`.
- **⚠ Languages (the main risk).** The public API accepts only `english` and `french`. *"Swahili, Hausa, Amharic and the other African languages… and the local dialects (Nouchi and Nigerian Pidgin) are on the Aethex enterprise platform."* Asking for them on the public API returns `403 language_not_available`. Kora 2.0 (29 Oct 2026) adds Yoruba, Hausa, Igbo and more "for enterprise customers, with API access to follow". To get access, email developers@aethexai.com or [book a demo](https://aethexai.com/book-demo). → [languages](https://developers.aethexai.com/docs/concepts/languages), [Kora 2.0 blog](https://aethexai.com/blog/kora-2.0-25-new-languages-and-dialects-across-emerging-markets), [iAfrica](https://iafrica.com/aethexai-adds-25-african-languages-to-voice-agents-with-kora-2-0/)
- **Pricing.** 4,000 credits buys 1 voice minute. The free trial is 60k credits, about 15 minutes. Hobby is $3/mo for 240k credits (60 min). Starter is $10/mo (220 min). Builder is $30/mo (750 min). The pricing page still says API pricing is "coming soon" (**conflicting**). → [pricing](https://aethexai.com/pricing)
- Other refs: [API reference](https://developers.aethexai.com/docs/api-reference), [changelog](https://developers.aethexai.com/docs/changelog), [voice stack blog](https://aethexai.com/blog/inside-the-aethex-voice-stack-agents-voices-tools-and-the-mcp-server), [SIP blog](https://aethexai.com/blog/giving-your-agent-a-number-sip-trunking-0)

## 4. Telnyx (carrier)

- SIP Connections handle inbound calls. Outbound Voice Profiles set allowed destinations and a daily spend cap. Aethex's integration creates these for us. → [SIP get started](https://developers.telnyx.com/docs/voice/sip-trunking/get-started), [credential types](https://developers.telnyx.com/docs/voice/sip-trunking/authentication/credential-types.md)
- **Call Control API** (`POST /v2/calls`, webhooks `call.initiated` etc., bidirectional media streaming at 16 kHz PCM) is what our **flash-to-callback line** and the fallback voice pipeline use. → [Call Control](https://developers.telnyx.com/docs/voice/call-control), [outbound AI calls tutorial](https://telnyx.com/resources/outbound-ai-calls-python-openai-live)
- **SMS.** `POST /v2/messages {from, to, text}` with Bearer auth. Off-net delivery may require sender registration. **Nigeria SMS deliverability and sender-ID rules are UNVERIFIED.** → [send message](https://developers.telnyx.com/docs/messaging/messages/send-message)
- **Costs (UNVERIFIED, extracted from pricing data, not verbatim).** A Nigeria local number is about $25 one-time plus $25/mo, and a mobile number about $35 plus $35/mo. Telnyx's Nigeria per-minute rate was not found. Benchmarks from other carriers: Plivo charges $0.158/min outbound to Nigeria, and Quo charges $0.30/min. → [Telnyx pricing](https://telnyx.com/pricing/elastic-sip), [Plivo NG](https://www.plivo.com/sip-trunking/coverage/ng/), [Quo NG](https://www.quo.com/rate/nigeria)

## 5. Fallback speech stack (if Aethex local languages are unavailable in time)

- [Spitch](https://techcabal.com/2025/07/17/african-ai-startups/) offers STT and TTS for Yoruba, Hausa, Igbo and Nigerian English, with pay-as-you-go developer API keys. [Intron Sahara](https://techcabal.com/2026/03/05/intron-expands-sahara-to-57-languages/) covers 57 languages. [YarnGPT](https://yarngpt.ai/) does Nigerian TTS.
- [HackerNoon: production voice architecture for Igbo/Yoruba/Hausa](https://hackernoon.com/inside-a-production-voice-architecture-for-igbo-yoruba-and-hausa) warns that tonal Yoruba and Hausa TTS quality is still weak commercially. → Keep agent turns short. Use DTMF menus as a reliable path. Let callers pick their language early.
- Telnyx's own AI assistants list 29+ languages, but Yoruba and Hausa are not confirmed. → [Telnyx STT language release note](https://telnyx.com/release-notes/specify-stt-language-ai-agents)

## 6. Decisions these findings forced

1. **Request Aethex enterprise and Kora 2.0 access today.** The whole multilingual demo depends on it. In parallel, build so that language is a per-call variable. The demo can start in English while the Yoruba, Hausa, Igbo and Pidgin prompts and voices are ready to switch on.
2. **Tools must answer in under 9 s.** Slow work (verifier fan-out calls) uses the 202 + call-note pattern, or a callback call to the voter.
3. **No INEC API.** The PU directory is seeded from INEC's public PU list for a demo LGA, and official notices (relocations) are entered by an authorised admin. We do not scrape INEC.
4. **Flash-to-callback.** Many voters cannot afford airtime. A second Telnyx number on Call Control rejects the incoming call (so the caller pays nothing) and Confam calls them back.

## 7. Elderly voters and voting by phone (researched 2026-11-18, round 2)

**Phone or remote voting is illegal in Nigeria under the Electoral Act 2026** (full text: https://thewest.ng/wp-content/uploads/2026/03/ElectoralAct2026.pdf, read directly):
- **s.55:** "A voter shall not record his or her vote otherwise than by personally attending at the polling unit or voting centres and recording his or her vote in the manner prescribed by the Commission."
- **s.47(2):** voters are accredited at the PU with BVAS, which verifies particulars biometrically (in person).
- **s.54(1):** a voter with a visual impairment or other disability may bring **a person of their choice** into the voting compartment. "No political party agent, candidate or party official" may accompany them.
- **s.54(2):** INEC "shall take reasonable steps" to assist "persons with disabilities, special needs and **vulnerable persons**" with Braille, large print, electronic devices, sign language, "or **off-site voting in appropriate cases**".
- **Definitions:** "vulnerable person" explicitly includes "**the sick and the elderly**". So elderly voters are entitled to s.54(2) support.
- **Guidelines para 25 (2022 Regulations):** the elderly, PWDs, pregnant women and nursing mothers get **priority access** at PUs. → [PLAC factsheet](https://placng.org/i/wp-content/uploads/2023/02/Factsheet-on-the-Electoral-Act-Provisions-Improving-the-Participation-of-Marginalised-Groups-in-Nigerian-Elections.pdf), [NAN: prioritise older persons](https://nannews.ng/2023/02/23/prioritise-older-persons-on-election-day-coalition-urges-inec)
- **BVAS facial recognition fails more often for elderly voters** (2026 off-cycle elections). Observers want an alternative verification route. → [TechPolicy.Press](https://techpolicy.press/when-nigerias-election-technology-cannot-recognize-the-voter)
- In 2023, priority access often wasn't applied in practice. → [Dataphyte](https://elections.dataphyte.com/insights/nigeriadecides-vulnerable-voters-neglected-in-nigerias-voting-process)

**How phone voting works elsewhere (a future, not something to build now):**
- **Australia (AEC):** blind and low-vision voters register by phone (roll check plus a 6-digit PIN they choose, then an 8-digit registration number is issued). They then call back and vote with a **human operator** using only the number and PIN, so the vote stays anonymous. It runs for 10 business days before polling day. → [AEC telephone voting](https://aec.gov.au/Voting/Ways_to_vote/telephone.htm), [AEC BLV voters](https://aec.gov.au/referendums/vote/blv-voters.html)
- **Canada (Ontario municipalities):** over 215 use internet or telephone (IVR) voting, with a mailed PIN plus date of birth. Canada's online-voting standard **excludes IVR from its scope**, so security assurance is weaker. → [Simply Voting PIA](https://www.hanover.ca/sites/default/files/2026-08/Simply%20Voting_PIA_ReRA_Ontario_Municipal%202026-05-25.pdf), [Kawartha Lakes](https://kawarthalakes-014-ca.govstack.com/government-administration/elections/electronic-voting/)

**Conclusion.** Building phone voting would break s.55 and could not prove the voter's identity (BVAS) or keep the ballot secret on a shared basic phone. What the law already allows, and what the agent can make actually happen, is: **priority access, a helper chosen by the voter, and s.54(2) off-site or assisted arrangements requested in advance**, plus a "go now, the queue is short and officials are there" call. A phone ballot like Australia's AEC model can be a "future, requires amending s.55" slide in the pitch.

## 8. Live check of the Aethex account + local-language options (2026-11-19)

- **Live API test with the team's key:** creating an agent with `language: yoruba` / `hausa` / `nigerian_pidgin` returns `403 language_not_available` ("…available on the Aethex enterprise platform only"). Request IDs: 2bc85383-6c81-49d0-8cc0-bd37555b1562, c3c31d35-c2a9-4ea8-b654-b038b121a1cc, d9d3d5e0-796d-4119-ac27-674ebab9438b. `GET /voices` returns 100 voices: English (about 45 Nigerian-accented: Femi, Kemi, Chinedu, Fatima, Musa, Ifeoma…) and French. None are in Yoruba, Hausa or Igbo. The catalog models include claude-opus-5-5, claude-sonnet-4-6 and claude-haiku-4-5. This matches the public [languages page](https://developers.aethexai.com/docs/concepts/languages).
- **Spitch** (from the official SDK [spi-tch/spitch-python](https://github.com/spi-tch/spitch-python), generated from their OpenAPI spec):
  - TTS is `POST /v1/speech {text, voice, format, language, speed}`. Voices include sade, segun, femi, funmi (yo), amina, aliyu, hasan, zainab (ha), ngozi, amara, obinna, ebuka (ig) and others.
  - **TTS outputs `mulaw`, `alaw` and `pcm_s16le`, so it is telephony-ready.**
  - STT is `POST /v1/transcriptions {content, language, timestamp, special_words}` and is **batch only (file/bytes/URL). The SDK has no streaming.**
  - Also offers `/v1/translate` and `/v1/diacritics`.
  - Pricing as listed via Cencori: TTS $0.030 per 1k chars, STT $0.010/min. New accounts get $1 free credit. → [Cencori changelog](https://cencori.com/changelog/spitch-on-cencori), [iAfrica](https://iafrica.com/cencori-and-spitch-partner-to-give-african-developers-yoruba-hausa-igbo-and-amharic-voice-ai-through-one-api/)
- **Other Nigerian speech vendors (self-reported, unverified):**
  - [Indigenius](https://indigenius.ai/): streaming plus SIP/Twilio, Hausa and Yoruba, Igbo "coming soon".
  - [9jaLingo](https://www.9jalingo.org/): streaming TTS/STT for ha, ig, yo and Pidgin.
  - [Maraba/Orinode](https://maraba.ai/blog/voice-to-text-nigeria/): STT trained on telephone audio, with code-switching.

## 9. Real-time speech-to-speech alternatives (2026-11-19)

**Google Gemini Live API** ([capabilities](https://aistudio.google.com/docs/live-api/capabilities), [overview](https://aistudio.google.com/docs/live-api)). The Live API is "in preview".
- **Models:** `gemini-3.8-live` (native audio, default) and `gemini-3.8-live-extended-thinking`. Older ones are `gemini-3.1-flash-live-preview` and `gemini-2.5-flash-native-audio-preview-12-2025`.
- **Languages:** the language table lists **Yoruba (`yo`) and Hausa (`ha`)**. **Igbo and Nigerian Pidgin are not listed.** Native-audio models pick the language automatically, and you can restrict it through system instructions. (The table came from a model summary of the page tail, so it needs re-checking.)
- **Tools:** function calling works during a session (`gemini-3.8-live` supports async `NON_BLOCKING` plus scheduling `SILENT|WHEN_IDLE|INTERRUPTED`).
- **Audio:** the transport is a stateful WSS connection. Input is 16-bit PCM at 16 kHz, output 16-bit PCM at 24 kHz. **There is no μ-law/8 kHz option**, so our bridge resamples to and from Telnyx (Telnyx media streaming supports 16 kHz L16).
- **Limits:** an audio-only session lasts about 15 minutes (session resumption extends it). VAD silence of 500–800 ms is recommended.
- **TTS:** `gemini-3.8-flash-tts` lists **Hausa and Igbo** (not Yoruba) and outputs `audio/mulaw`. It is not a Live model.
- **STT:** Chirp 3 STT lists `ha-NG` and `yo-NG` (Preview), with no Igbo. → [Chirp 3](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3)

**OpenAI Realtime** ([gpt-realtime-2](https://developers.openai.com/api/docs/models/gpt-realtime-2), [realtime guide](https://developers.openai.com/api/docs/guides/realtime), [SIP](https://developers.openai.com/api/docs/guides/voice-sip?api=live))
- **Models:** `gpt-realtime-2.1` is the newest and supports tool use. Audio costs $32 per 1M input tokens and $64 per 1M output tokens. `gpt-realtime-translate` (70+ input languages, 13 output languages) and `gpt-realtime-whisper`/`gpt-live-transcribe` cost $0.017/min.
- **Telephony:** native SIP (`sip:$PROJECT_ID@sip.api.openai.com;transport=tls`, SRTP required) and G.711 μ-law/A-law over WebSocket.
- **Languages:** **Yoruba, Hausa, Igbo and Pidgin are not named anywhere in the docs.** Support is unknown and needs testing.

**Aethex workarounds.** No plan unlocks local languages. They are gated as "enterprise", not by tier (Hobby, Starter and Builder only differ in credits). BYO-LLM doesn't help because Aethex still owns STT/TTS. The only workaround on our plan is **Pidgin through the prompt** on an English agent with a Nigerian voice.

## 10. Live tests on the Aethex account (2026-11-19)

All tests were run with the team key. The audio files are in `voice-samples/` (gitignored).

1. **STT understands real Yoruba, Hausa and Igbo.** We used native-speaker clips (HF `shunyalabs/yoruba-speech-dataset`, `shunyalabs/hausa-speech-dataset`, `mkg25gpx/igbosyncorp-igbo-asr-benchmark`), converted them to 8 kHz phone quality, and sent them to `POST /transcribe` with `language=english`. The transcripts were near-verbatim, and Yoruba even kept its tone marks. Example: truth "fred ń sáré ní máìlì 105…", heard "fred ń sáré ní máìlì 15…". The Hausa and Igbo clips were similarly accurate.
2. **Pidgin STT works.** One clip was near-perfect. Another came back in a phonetic Krio-like spelling ("a dɔn chɛk da jist…"), which is still readable by an LLM.
3. **The agent LLM understands Yoruba, Hausa and Igbo and replies in Pidgin or English.** We tested a temporary agent (claude-sonnet-4-6) through `POST /agents/:id/chat` and deleted it afterwards. Every rumour question ("fighting at Ojuelegba PU, is it true?") was understood correctly. The model sometimes opened with a local-language phrase ("Mo gbọ́ pé…"), so the prompt must forbid local-language words in replies (the TTS can't say them) and forbid emoji.
4. **TTS cannot speak Yoruba, Hausa or Igbo.** Nigerian English voices reading local-language text and transcribed back gave: Hausa partly intelligible ("bakada safia … makaranta st mary"), Yoruba and Igbo garbled ("ibùdó ìdìbò" became "ibɛdo ẹdebe"). The tones are lost.

**Resulting design option:** a caller can **speak** Yoruba, Hausa, Igbo, Pidgin or English and be understood. Confam **replies** in Pidgin or Nigerian English. When Aethex enterprise access arrives, replies switch to native-language voices.
