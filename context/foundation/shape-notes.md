---
project: "10xCards"
context_type: greenfield
created: 2026-09-10
updated: 2026-09-10
checkpoint:
  current_phase: 4.5
  phases_completed: [1, 2, 3]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "tarcie w procesie (proces ręcznego tworzenia fiszek jest zbyt pracochłonny)"
    - topic: "insight"
      decision: "zero-friction tworzenie fiszek w miejscu researchu (copy-paste), nie osobna sesja"
    - topic: "primary persona scope"
      decision: "profesjonaliści IT/tech (programiści, inżynierowie)"
    - topic: "auth strategy"
      decision: "login email + hasło; model płaski, jedna rola, brak panelu admina w MVP"
    - topic: "mvp scope"
      decision: "logowanie → wklej tekst → AI generuje fiszki → akceptacja/edycja/odrzucenie → zapis → ręczne dodawanie → nauka z gotowym algorytmem powtórek"
    - topic: "timeline revision"
      decision: "zrewidowano z 3 tygodni na 4 wieczory; użytkownik świadomie przyjął ryzyko napiętego terminu zamiast zawężać zakres — patrz Timeline acknowledgment"
  frs_drafted: 9
  quality_check_status: pending
timeline_budget:
  mvp_weeks: 1
  hard_deadline: null
  after_hours_only: true
---

## Vision & Problem Statement

Profesjonaliści IT/tech (programiści, inżynierowie) regularnie napotykają w pracy trudne zadania wymagające nauczenia się nowej wiedzy z dokumentacji technicznej i forów takich jak Stack Overflow. Zamiast utrwalać tę wiedzę, wracają do tych samych źródeł przy każdym kolejnym podobnym problemie — ręczne tworzenie wysokiej jakości fiszek edukacyjnych z przeczytanego materiału jest na tyle czasochłonne, że rezygnują ze spaced repetition mimo świadomości jego skuteczności.

Fiszki mogą powstawać w momencie researchu — poprzez wklejenie fragmentu przeczytanej dokumentacji czy odpowiedzi z forum — zamiast wymagać osobnej, zaplanowanej sesji "zrobię sobie fiszki". Ta zmiana miejsca i momentu tworzenia fiszek obniża barierę wejścia na tyle, że użytkownicy faktycznie budują nawyk utrwalania wiedzy, zamiast tylko konsumować ją jednorazowo.

## User & Persona

**Profesjonalista IT/tech** (np. programista, inżynier oprogramowania) uczący się na bieżąco w trakcie pracy. Sięga po produkt tuż po tym, jak znajdzie odpowiedź na nurtujący go problem techniczny w dokumentacji lub na forum (np. Stack Overflow) — chce zachować tę wiedzę w formie fiszki do późniejszej powtórki, zamiast tracić ją i researchować od nowa przy następnym podobnym zadaniu.

## Access Control

Logowanie przez e-mail + hasło. Fiszki są przypisane do konta użytkownika i dostępne po zalogowaniu z dowolnego urządzenia. Model płaski — jedna rola, wszyscy zalogowani użytkownicy mają te same uprawnienia do własnych fiszek. Brak panelu administracyjnego w MVP. Niezalogowany użytkownik nie ma dostępu do żadnych funkcji poza ekranem logowania/rejestracji.

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

## Functional Requirements

### Generowanie AI
- FR-001: Użytkownik może wkleić tekst źródłowy (kopiuj-wklej) i otrzymać wygenerowane przez AI propozycje fiszek. Priority: must-have
- FR-002: Użytkownik może zaakceptować, edytować lub odrzucić każdą wygenerowaną propozycję fiszki przed zapisaniem. Priority: must-have
- FR-003: Zaakceptowane fiszki trafiają do kolekcji użytkownika. Priority: must-have

### Ręczne zarządzanie fiszkami
- FR-004: Użytkownik może ręcznie utworzyć fiszkę (pytanie/odpowiedź). Priority: must-have
- FR-005: Użytkownik może przeglądać listę swoich fiszek. Priority: must-have
- FR-006: Użytkownik może edytować istniejącą fiszkę. Priority: must-have
- FR-007: Użytkownik może usunąć fiszkę. Priority: must-have

### Konto użytkownika
- FR-008: Użytkownik może założyć konto i zalogować się (email + hasło). Priority: must-have

### Nauka
- FR-009: Użytkownik może uczyć się swoich fiszek z wykorzystaniem gotowego, zintegrowanego algorytmu powtórek. Priority: must-have

## Timeline acknowledgment

Acknowledged on 2026-09-10: pełny zakres MVP (9 FR-ów — logowanie, generowanie AI z recenzją, ręczne CRUD fiszek, integracja z algorytmem powtórek) w budżecie 4 wieczorów to bardzo napięty termin. Użytkownik świadomie przyjął to ryzyko zamiast zawężać zakres, rozumiejąc że wymaga to skupionego, efektywnego wysiłku w każdym z 4 wieczorów.
