---
project: "10xCards"
version: 1
status: draft
created: 2026-09-12
updated: 2026-09-14
prd_version: 1
main_goal: speed
top_blocker: decisions
milestone_id: core-flashcards-mvp
milestone_seq: 1
milestone_status: open
---

# Roadmap: 10xCards

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Core flashcards MVP** — Status: open

- **Intent:** Dowieźć pełny zakres MVP zdefiniowany w PRD — logowanie, generowanie fiszek AI z recenzją użytkownika, ręczne zarządzanie fiszkami i sesję nauki z gotowym algorytmem powtórek — w budżecie jednego tygodnia, tylko wieczorami.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001–FR-009, US-01.

## Vision recap

Profesjonaliści IT/tech regularnie uczą się nowych rzeczy z dokumentacji technicznej i forów (np. Stack Overflow), ale ręczne tworzenie fiszek jest na tyle czasochłonne, że rezygnują ze spaced repetition mimo świadomości jego skuteczności. Produkt pozwala tworzyć fiszki w momencie researchu — przez wklejenie fragmentu przeczytanego tekstu — zamiast wymagać osobnej, zaplanowanej sesji, obniżając barierę wejścia na tyle, by realnie zbudować nawyk utrwalania wiedzy.

## North star

**S-02: Użytkownik generuje i recenzuje fiszki AI** — najmniejszy pełny przepływ, który dowodzi, że produkt działa: wklejenie tekstu → propozycje AI → accept/edit/reject → zapis do kolekcji. Sekwencjonowany zaraz po tym, jak logowanie zacznie działać na żywym projekcie, bo to jedyny sposób, by zmierzyć oba główne kryteria sukcesu MVP.

> "Gwiazda przewodnia" (north star) to najmniejszy pełny (end-to-end) przepływ, którego udane dostarczenie dowodzi, że główna hipoteza produktu działa — umieszczony tak wcześnie w kolejności, jak tylko pozwalają na to jego zależności, bo cała reszta ma sens tylko wtedy, gdy to działa.

## At a glance

| ID   | Change ID                          | Outcome (user can …)                                             | Prerequisites | PRD refs                      | Status   |
| ---- | ---------------------------------- | ---------------------------------------------------------------- | ------------- | ----------------------------- | -------- |
| F-01 | supabase-connection-and-schema     | (foundation) żywe połączenie Supabase + minimalny schemat fiszek | —             | Access Control, FR-008        | done |
| S-01 | working-signup-signin              | zakłada konto i loguje się                                       | F-01          | FR-008                        | done |
| S-02 | ai-flashcard-generation-review     | generuje i recenzuje fiszki AI (accept/edit/reject)              | F-01, S-01    | US-01, FR-001, FR-002, FR-003 | proposed |
| S-03 | manual-flashcard-create-and-list   | ręcznie tworzy fiszkę i przegląda swoją listę                    | F-01, S-01    | FR-004, FR-005                | proposed |
| S-04 | edit-existing-flashcard            | edytuje istniejącą fiszkę                                        | S-03          | FR-006                        | proposed |
| S-05 | delete-flashcard-with-confirmation | usuwa fiszkę, z potwierdzeniem                                   | S-03          | FR-007                        | proposed |
| S-06 | srs-review-session                 | uczy się fiszek w sesji z algorytmem powtórek (SRS)              | S-03          | FR-009                        | blocked  |

## Streams

Nawigacyjna pomoc — grupuje elementy dzielące ten sam łańcuch zależności. Kanoniczna kolejność nadal żyje w grafie zależności poniżej; ta tabela to proponowana kolejność czytania po ścieżkach równoległych.

| Stream | Theme                    | Chain                    | Note                                                                                            |
| ------ | ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------- |
| A      | Wejście i generowanie AI | `F-01` → `S-01` → `S-02` | Rdzeń north star; main_goal=speed trzyma ten łańcuch możliwie krótkim.                          |
| B      | Ręczny CRUD fiszek       | `S-03` → `S-04`, `S-05`  | Odgałęzia się od `S-01` (dołącza do Stream A przy `S-01`); `S-04`/`S-05` równoległe.            |
| C      | Nauka (SRS)              | `S-06`                   | Samodzielny slice; dołącza do Stream B przy `S-03`; zablokowany do czasu wyboru biblioteki SRS. |

## Baseline

What's already in place in the codebase as of `2026-09-12` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands ze startera `10x-astro-starter` (`src/pages/*.astro`).
- **Backend / API:** present — API routes SSR (`output: "server"`), np. `src/pages/api/auth/{signin,signup,signout}.ts`.
- **Data:** absent — brak `supabase/migrations/*.sql`, brak `src/types.ts`; żadna encja fiszek jeszcze nie istnieje.
- **Auth:** partial — kod szkieletowy istnieje (`src/lib/supabase.ts`, `src/middleware.ts`, strony `src/pages/auth/*.astro`), ale nie ma żywego, podłączonego projektu Supabase (brak `.env`/`.dev.vars` w repo) — użytkownik potwierdził, że potrzebuje pomocy przy pełnej integracji.
- **Deploy / infra:** present — `wrangler.jsonc`, `.github/workflows/ci.yml` z auto-deploy na `master` (Cloudflare Workers).
- **Observability:** absent — brak sentry/datadog/otel/logging w `package.json`.

## Foundations

### F-01: Połączenie z projektem Supabase i minimalny schemat fiszek

- **Outcome:** (foundation) Projekt Supabase jest podłączony end-to-end (zmienne środowiskowe skonfigurowane dla lokalnego dev i dla Cloudflare Workers), a w bazie istnieje minimalna tabela `flashcards` z politykami RLS per-użytkownik — wystarczające, by pierwsze pionowe slice'y mogły zapisywać i odczytywać dane na żywo.
- **Change ID:** supabase-connection-and-schema
- **PRD refs:** Access Control, FR-008 (fundament, na którym opiera się logowanie i zapis fiszek)
- **Unlocks:** S-01 (logowanie), S-02 (generowanie i recenzja — gwiazda przewodnia), S-03 (ręczne tworzenie i lista)
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** Wymaga utworzenia/skonfigurowania żywego projektu Supabase przez użytkownika (konto, klucze) — agent może poprowadzić proces krok po kroku, ale akcja na koncie Supabase wykracza poza repo i wymaga użytkownika.
- **Unknowns:** —
- **Risk:** Bez tego fundamentu żadna historia użytkownika nie działa end-to-end — dziś auth i dane to tylko szkielet z startera. Sekwencjonowany jako pierwszy, bo blokuje dosłownie wszystko inne. Ryzyko: trzy różne mechanizmy zmiennych środowiskowych (`.env` / `.dev.vars` / `wrangler secret`) dla tych samych kluczy Supabase mogą się rozjechać pod presją czasu (patrz `infrastructure.md`).
- **Status:** done

## Slices

### S-01: Użytkownik zakłada konto i loguje się

- **Outcome:** user can zarejestrować konto e-mail + hasło i zalogować się, uzyskując dostęp do własnej kolekcji fiszek z dowolnego urządzenia.
- **Change ID:** working-signup-signin
- **PRD refs:** FR-008, Access Control
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Kod szkieletowy (signin/signup/middleware) już istnieje w repo, ale nigdy nie był wykonany wobec żywego projektu — pierwsza weryfikacja może odkryć rozjazd konfiguracji (patrz Risk F-01).
- **Status:** done

### S-02: Użytkownik generuje i recenzuje fiszki AI

- **Outcome:** user can wkleić tekst źródłowy, uruchomić generowanie AI, zobaczyć listę wygenerowanych propozycji fiszek i zaakceptować/edytować/odrzucić każdą z nich — zaakceptowane trafiają do jego kolekcji.
- **Change ID:** ai-flashcard-generation-review
- **PRD refs:** US-01, FR-001, FR-002, FR-003
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:**
  - Jaki dostawca/API LLM zostanie użyty do generowania i jak zarządzane są klucze API? (`tech-stack.md` celowo zostawia to ogólne: "normalne wywołanie API do dostawcy LLM"). — Owner: user/team. Block: no (decyzja implementacyjna, do podjęcia w `/10x-plan`).
  - Dokładny limit długości wklejanego tekstu (PRD Open Question #1, FR-001). — Owner: user. Block: no (sama notatka Socratic w PRD wskazuje, że wartość liczbowa ma być ustalona na etapie implementacji).
- **Risk:** To jest gwiazda przewodnia — sekwencjonowana zaraz po auth, bo to jedyny sposób, by zmierzyć oba główne kryteria sukcesu (75% akceptacji AI, 75% fiszek tworzonych przez AI). Ryzyko: NFR wymaga potwierdzenia startu generowania w 200ms i widocznego postępu przy generowaniu >2s — łatwo pominąć pod presją napiętego terminu.
- **Status:** proposed

### S-03: Użytkownik ręcznie tworzy fiszkę i przegląda listę swoich fiszek

- **Outcome:** user can ręcznie utworzyć fiszkę (pytanie/odpowiedź) i zobaczyć ją na liście swojej kolekcji fiszek.
- **Change ID:** manual-flashcard-create-and-list
- **PRD refs:** FR-004, FR-005
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Świadomie połączone w jeden slice (create + list) — tworzenie fiszki bez miejsca, by zobaczyć efekt, nie ma samodzielnej wartości użytkowej.
- **Status:** proposed

### S-04: Użytkownik edytuje istniejącą fiszkę

- **Outcome:** user can edytować dowolną istniejącą fiszkę (utworzoną ręcznie lub przez AI) i zapisać zmiany.
- **Change ID:** edit-existing-flashcard
- **PRD refs:** FR-006
- **Prerequisites:** S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Zależy od widoku listy (S-03), by użytkownik miał z czego wybrać fiszkę do edycji; poza tym niskie ryzyko — to prosta operacja CRUD.
- **Status:** proposed

### S-05: Użytkownik usuwa fiszkę z potwierdzeniem

- **Outcome:** user can usunąć fiszkę ze swojej kolekcji, po wyraźnym potwierdzeniu przed trwałym usunięciem.
- **Change ID:** delete-flashcard-with-confirmation
- **PRD refs:** FR-007
- **Prerequisites:** S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Guardrail "brak utraty fiszek użytkownika bez ostrzeżenia" wymaga wymuszonego potwierdzenia — pominięcie go pod presją czasu byłoby regresją na guardrailu, nie tylko drobnym niedopatrzeniem.
- **Status:** proposed

### S-06: Użytkownik uczy się fiszek w sesji z algorytmem powtórek (SRS)

- **Outcome:** user can rozpocząć sesję nauki, w której fiszki pojawiają się w kolejności wyznaczonej przez zintegrowany algorytm powtórek (nie chronologicznie ani losowo), i odpowiadać na nie, zasilając harmonogram kolejnych powtórek.
- **Change ID:** srs-review-session
- **PRD refs:** FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:**
  - Który gotowy algorytm/biblioteka SRS zostanie zintegrowany? PRD mówi tylko o "gotowym, zintegrowanym algorytmie powtórek" (Socratic FR-009 nazywa to wprost "sednem produktu"), nie wskazując konkretnego wyboru; `tech-stack.md` też go nie nazywa. — Owner: user. Block: yes.
- **Risk:** Jedyny slice z twardym blokerem — bez wybranej biblioteki/algorytmu SRS nie da się sensownie zaplanować ani schematu danych do harmonogramowania powtórek, ani logiki samej sesji.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                          | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                          |
| ---------- | ---------------------------------- | ------------------------------------------------------------ | --------------------- | ---------------------------------------------- |
| F-01       | supabase-connection-and-schema     | Connect live Supabase project + minimal flashcards schema    | yes                   | Run `/10x-plan supabase-connection-and-schema` |
| S-01       | working-signup-signin              | Working signup/signin against live Supabase                  | no                    | Depends on F-01                                |
| S-02       | ai-flashcard-generation-review     | AI flashcard generation with accept/edit/reject (north star) | no                    | Depends on F-01, S-01                          |
| S-03       | manual-flashcard-create-and-list   | Manual flashcard create + list view                          | no                    | Depends on F-01, S-01                          |
| S-04       | edit-existing-flashcard            | Edit existing flashcard                                      | no                    | Depends on S-03                                |
| S-05       | delete-flashcard-with-confirmation | Delete flashcard with confirmation                           | no                    | Depends on S-03                                |
| S-06       | srs-review-session                 | SRS-based learning/review session                            | no                    | Blocked — SRS library/algorithm undecided      |

## Open Roadmap Questions

1. **Jaki jest dokładny limit długości wklejanego tekstu źródłowego (FR-001)?** — Owner: user. Block: S-02 (nie blokuje planowania — wartość domyślna do ustalenia w `/10x-plan`).
2. **Jaki jest orientacyjny target qps (`target_scale.qps`)?** — Owner: user. Block: roadmap-wide (informacyjne — `tech-stack.md` już wybrał stos zakładając małą skalę).
3. **Jaki jest orientacyjny wolumen danych (`target_scale.data_volume`)?** — Owner: user. Block: roadmap-wide (informacyjne, jak wyżej).
4. **Formalne kryteria Given/When/Then zdefiniowano tylko dla US-01. Ręczne CRUD (FR-004–007), logowanie (FR-008) i sesja nauki (FR-009) nie mają odpowiadających im user stories.** — Owner: user. Block: S-03, S-04, S-05, S-06 (planowalne z samych opisów FR, ale bez formalnych kryteriów akceptacji).

## Parked

- **Własny, zaawansowany algorytm powtórek (jak SuperMemo, Anki)** — Why parked: PRD Non-Goals; używamy gotowego SRS zamiast budować własny, to nie jest przewaga konkurencyjna dla MVP.
- **Import wielu formatów (PDF, DOCX, itp.)** — Why parked: PRD Non-Goals; MVP obsługuje wyłącznie kopiuj-wklej tekstu.
- **Współdzielenie zestawów fiszek między użytkownikami** — Why parked: PRD Non-Goals; fiszki są prywatne dla konta.
- **Integracje z innymi platformami edukacyjnymi** — Why parked: PRD Non-Goals; brak integracji zewnętrznych w MVP.
- **Aplikacje mobilne** — Why parked: PRD Non-Goals; na początek tylko web.
- **Deduplikacja fiszek** — Why parked: PRD Non-Goals / Socratic FR-003; świadomie akceptujemy możliwe duplikaty w MVP.

## Milestone History

(empty — pierwszy milestone)

## Done

- **F-01: (foundation) żywe połączenie Supabase + minimalny schemat fiszek** — Archived 2026-09-14 → `context/archive/2026-09-12-supabase-connection-and-schema/`. Lesson: —.
- **S-01: zakłada konto i loguje się** — Archived 2026-09-14 → `context/archive/2026-09-14-working-signup-signin/`. Lesson: —.
