---
project: "10xCards"
version: 1
status: draft
created: 2026-09-10
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: "# TODO: qps — see Open Questions"
  data_volume: "# TODO: data_volume — see Open Questions"
timeline_budget:
  mvp_weeks: 1
  hard_deadline: "2026-09-14"
  after_hours_only: true
---

## Vision & Problem Statement

Profesjonaliści IT/tech (programiści, inżynierowie) regularnie napotykają w pracy trudne zadania wymagające nauczenia się nowej wiedzy z dokumentacji technicznej i forów takich jak Stack Overflow. Zamiast utrwalać tę wiedzę, wracają do tych samych źródeł przy każdym kolejnym podobnym problemie — ręczne tworzenie wysokiej jakości fiszek edukacyjnych z przeczytanego materiału jest na tyle czasochłonne, że rezygnują ze spaced repetition mimo świadomości jego skuteczności.

Fiszki mogą powstawać w momencie researchu — poprzez wklejenie fragmentu przeczytanej dokumentacji czy odpowiedzi z forum — zamiast wymagać osobnej, zaplanowanej sesji "zrobię sobie fiszki". Ta zmiana miejsca i momentu tworzenia fiszek obniża barierę wejścia na tyle, że użytkownicy faktycznie budują nawyk utrwalania wiedzy, zamiast tylko konsumować ją jednorazowo.

## User & Persona

**Profesjonalista IT/tech** (np. programista, inżynier oprogramowania) uczący się na bieżąco w trakcie pracy. Sięga po produkt tuż po tym, jak znajdzie odpowiedź na nurtujący go problem techniczny w dokumentacji lub na forum (np. Stack Overflow) — chce zachować tę wiedzę w formie fiszki do późniejszej powtórki, zamiast tracić ją i researchować od nowa przy następnym podobnym zadaniu.

## Success Criteria

### Primary
- 75% fiszek wygenerowanych przez AI jest akceptowane przez użytkownika
- Użytkownicy tworzą 75% fiszek z wykorzystaniem AI (w przeciwieństwie do tworzenia ręcznego)

### Secondary
- Użytkownicy wracają do sesji nauki (powtórek) regularnie — sygnał budowania nawyku, ale nie kluczowy miernik sukcesu MVP

### Guardrails
- Prywatność danych użytkownika: treści wklejane do generowania fiszek (mogą zawierać fragmenty kodu/dokumentów firmowych) nie mogą wyciec ani być wykorzystane poza kontekstem użytkownika

## User Stories

### US-01: Użytkownik generuje fiszki z wklejonego tekstu

- **Given** zalogowany użytkownik ma fragment tekstu (np. z dokumentacji technicznej)
- **When** wkleja go do pola generowania i uruchamia generowanie AI
- **Then** widzi listę wygenerowanych propozycji fiszek, które może zaakceptować, edytować lub odrzucić — zaakceptowane trafiają do jego kolekcji

#### Acceptance Criteria
- Propozycje fiszek są prezentowane pojedynczo lub w liście z wyraźną akcją accept/edit/reject dla każdej
- Odrzucone propozycje nie trafiają do kolekcji
- Edytowana przed akceptacją propozycja zapisuje się z wprowadzonymi zmianami

# TODO: user stories for remaining flows (manual CRUD, authentication, learning/review session) — see Open Questions

## Functional Requirements

### Generowanie AI
- FR-001: Użytkownik może wkleić tekst źródłowy (kopiuj-wklej, do ustalonego limitu długości) i otrzymać wygenerowane przez AI propozycje fiszek. Priority: must-have
  > Socratic: Kontrargument: brak limitu długości tekstu groziłby niekontrolowanym kosztem/czasem generowania. Rozwiązanie: dodano limit długości wklejanego tekstu jako guardrail (dokładna wartość liczbowa do ustalenia na etapie implementacji).
- FR-002: Użytkownik może zaakceptować, edytować lub odrzucić każdą wygenerowaną propozycję fiszki przed zapisaniem. Priority: must-have
  > Socratic: Brak kontrargumentu — FR pozostaje bez zmian.
- FR-003: Zaakceptowane fiszki trafiają do kolekcji użytkownika. Priority: must-have
  > Socratic: Kontrargument: powtarzające się wklejenia podobnego tekstu mogą tworzyć duplikaty fiszek. Rozwiązanie: brak deduplikacji w MVP — akceptowane świadomie, patrz Non-Goals.

### Ręczne zarządzanie fiszkami
- FR-004: Użytkownik może ręcznie utworzyć fiszkę (pytanie/odpowiedź). Priority: must-have
  > Socratic: Brak kontrargumentu — celowy fallback, gdy AI nie wystarcza; FR pozostaje.
- FR-005: Użytkownik może przeglądać listę swoich fiszek. Priority: must-have
  > Socratic: Brak kontrargumentu — FR pozostaje bez zmian.
- FR-006: Użytkownik może edytować istniejącą fiszkę. Priority: must-have
  > Socratic: Brak kontrargumentu — FR pozostaje bez zmian.
- FR-007: Użytkownik może usunąć fiszkę, z potwierdzeniem przed trwałym usunięciem. Priority: must-have
  > Socratic: Kontrargument: ryzyko przypadkowej utraty fiszki narusza guardrail "brak utraty fiszek użytkownika". Rozwiązanie: dodano wymóg potwierdzenia usunięcia.

### Konto użytkownika
- FR-008: Użytkownik może założyć konto i zalogować się (email + hasło). Priority: must-have
  > Socratic: Brak kontrargumentu — konto jest niezbędne dla trwałości i prywatności fiszek; FR pozostaje.

### Nauka
- FR-009: Użytkownik może uczyć się swoich fiszek z wykorzystaniem gotowego, zintegrowanego algorytmu powtórek. Priority: must-have
  > Socratic: Brak kontrargumentu — to sedno produktu; FR pozostaje jako must-have.

## Non-Functional Requirements

- Użytkownik widzi potwierdzenie rozpoczęcia generowania fiszek w ciągu 200 ms od wysłania tekstu, oraz ciągły, widoczny sygnał postępu, jeśli generowanie trwa dłużej niż 2 sekundy — nigdy pusty ekran bez informacji zwrotnej.

## Business Logic

Aplikacja przekształca wklejony tekst źródłowy w zestaw par pytanie-odpowiedź reprezentujących kluczowe pojęcia zawarte w tym tekście, a następnie decyduje, kiedy pokazać użytkownikowi każdą fiszkę do powtórki na podstawie jego dotychczasowych odpowiedzi.

Regułę zasilają dwa rodzaje wejść: (1) fragment tekstu wklejony przez użytkownika (np. z dokumentacji technicznej, artykułu, odpowiedzi na forum) w momencie generowania fiszek, oraz (2) historia odpowiedzi użytkownika z poprzednich sesji powtórek. Wyjściem pierwszej decyzji jest lista propozycji fiszek do recenzji; wyjściem drugiej — kolejność i moment prezentacji poszczególnych fiszek podczas nauki.

Użytkownik spotyka tę regułę dwukrotnie w swoim przepływie: od razu po wklejeniu tekstu (otrzymuje propozycje do zaakceptowania/edycji/odrzucenia) oraz podczas sesji nauki (fiszki pojawiają się w kolejności wyznaczonej przez harmonogram powtórek, a nie chronologicznie czy losowo).

## Access Control

Logowanie przez e-mail + hasło. Fiszki są przypisane do konta użytkownika i dostępne po zalogowaniu z dowolnego urządzenia. Model płaski — jedna rola, wszyscy zalogowani użytkownicy mają te same uprawnienia do własnych fiszek. Brak panelu administracyjnego w MVP. Niezalogowany użytkownik nie ma dostępu do żadnych funkcji poza ekranem logowania/rejestracji.

## Non-Goals

- **Własny, zaawansowany algorytm powtórek** (jak SuperMemo, Anki) — używamy gotowego, sprawdzonego algorytmu SRS zamiast budować własny; to nie jest przewaga konkurencyjna dla MVP.
- **Import wielu formatów** (PDF, DOCX, itp.) — MVP obsługuje wyłącznie kopiuj-wklej tekstu.
- **Współdzielenie zestawów fiszek między użytkownikami** — fiszki są prywatne dla konta, bez publikowania/udostępniania talii.
- **Integracje z innymi platformami edukacyjnymi** — brak integracji zewnętrznych w MVP.
- **Aplikacje mobilne** — na początek tylko web.
- **Deduplikacja fiszek** — świadomie akceptujemy możliwe duplikaty w MVP (patrz Socratic FR-003); brak mechanizmu wykrywania podobnych fiszek.

## Open Questions

1. **Jaki jest dokładny limit długości wklejanego tekstu źródłowego (FR-001)?** — Owner: user. By: przed implementacją FR-001. Zaznaczone w shape-notes jako "dokładna wartość liczbowa do ustalenia na etapie implementacji".
2. **Jaki jest orientacyjny target qps (target_scale.qps)?** — Owner: user. By: przed 10x-tech-stack-selector.
3. **Jaki jest orientacyjny wolumen danych (target_scale.data_volume)?** — Owner: user. By: przed 10x-tech-stack-selector.
4. **Formalne kryteria Given/When/Then zdefiniowano tylko dla US-01 (generowanie AI). Ręczne zarządzanie fiszkami (FR-004–FR-007), logowanie/rejestracja (FR-008) oraz sesja nauki (FR-009) nie mają odpowiadających im user stories.** — Owner: user. By: przed planowaniem implementacji, jeśli potrzebne są formalne kryteria akceptacji dla tych przepływów.
