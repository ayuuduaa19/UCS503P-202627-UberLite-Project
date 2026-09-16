# UberLite 🚗

> **UCS503P — Software Engineering Project**
> A lightweight ride-hailing system built with React + TypeScript (frontend) and Node.js + Express + Prisma + PostgreSQL (backend).

**Team:**
- Ayush (1024030740)
- Anshika (1024030749)
- Gurleen Kaur (1024030325)

---

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Analysis Phase](#analysis-phase)
  - [2.1 Use Cases](#21-use-cases)
  - [2.2 Activity & Swimlane Diagrams](#22-activity--swimlane-diagrams)
  - [2.3 Data Flow Diagrams](#23-data-flow-diagrams)
  - [2.5 User Stories](#25-user-stories)
- [Getting Started](#getting-started)

---

## Project Overview

UberLite is a simplified ride-hailing platform implementing core functionality:
- Passenger and Driver authentication (JWT)
- Real-time driver availability & GPS location management
- Haversine-based proximity driver matching
- Full ride lifecycle: Request → Match → Accept → In-Progress → Complete

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Validation | Zod |
| Testing | Jest |

---

## Analysis Phase

### 2.1 Use Cases

#### 2.1.1 — Use-Case Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#ffb6c1', 'primaryBorderColor': '#e75480', 'primaryTextColor': '#1a1a1a', 'secondaryColor': '#ffb6c1', 'tertiaryColor': '#ffb6c1'}}}%%
graph TD
    subgraph Actors
        P((Passenger))
        D((Driver))
        S((System))
    end

    subgraph UberLite System
        UC1[Register Account]
        UC2[Login]
        UC3[Request a Ride]
        UC4[View Nearby Drivers]
        UC5[View Ride History]
        UC6[View Ride Details]
        UC7[Cancel Ride]
        UC8[Toggle Availability]
        UC9[Update Location]
        UC10[Accept Ride]
        UC11[Reject Ride]
        UC12[View Assigned Rides]
        UC13[Auto-Match Driver to Ride]
    end

    P --> UC1
    P --> UC2
    P --> UC3
    P --> UC4
    P --> UC5
    P --> UC6
    P --> UC7

    D --> UC1
    D --> UC2
    D --> UC8
    D --> UC9
    D --> UC10
    D --> UC11
    D --> UC12

    UC3 --> UC13
    S --> UC13
```

#### 2.1.2 — Use Case Templates

**UC-01: Request a Ride**

| Field | Detail |
|---|---|
| **Use Case ID** | UC-01 |
| **Actor** | Passenger |
| **Precondition** | Passenger is authenticated (JWT token valid) |
| **Trigger** | Passenger submits pickup & drop-off address |
| **Main Flow** | 1. Passenger sends `POST /api/passenger/rides`. 2. System validates input via Zod. 3. Ride created in DB with status `REQUESTED`. 4. Ride details returned. |
| **Alternate Flow** | If coords missing, ride created with address strings only. |
| **Postcondition** | Ride record exists with status `REQUESTED`. |
| **Exception** | Invalid token → 401. Validation failure → 400. |

**UC-02: Auto-Match Nearest Driver**

| Field | Detail |
|---|---|
| **Use Case ID** | UC-02 |
| **Actor** | Passenger (triggers), System (executes) |
| **Precondition** | Ride exists with status `REQUESTED`. Available drivers exist with valid coords. |
| **Trigger** | `POST /api/passenger/rides/:id/match` |
| **Main Flow** | 1. Fetch all `isAvailable=true` drivers. 2. Filter by valid GPS. 3. Compute Haversine distance to pickup. 4. Filter by `maxRadiusKm` (default 10 km). 5. Sort: nearest first, tie-break by rating. 6. Assign nearest driver; status → `ACCEPTED`. |
| **Postcondition** | Ride assigned to driver; status = `ACCEPTED`. |
| **Exception** | No drivers in radius → 404. Ride already assigned → 409. |

**UC-03: Toggle Driver Availability**

| Field | Detail |
|---|---|
| **Use Case ID** | UC-03 |
| **Actor** | Driver |
| **Precondition** | Driver is authenticated. |
| **Trigger** | `PATCH /api/driver/availability` with `{ isAvailable: boolean }` |
| **Main Flow** | 1. Validate `isAvailable` via Zod. 2. Update `driver.isAvailable` in DB. 3. Return updated status. |
| **Postcondition** | Driver immediately visible/hidden in matching pool. |
| **Exception** | Invalid token → 401. Non-boolean → 400. |

---

### 2.2 Activity & Swimlane Diagrams

#### Activity Diagram — Full Ride Booking Flow

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#ffb6c1', 'primaryBorderColor': '#e75480', 'primaryTextColor': '#1a1a1a', 'secondaryColor': '#ffb6c1', 'tertiaryColor': '#ffb6c1'}}}%%
flowchart TD
    A([Passenger Opens App]) --> B[Login / Register]
    B --> C{Auth Success?}
    C -- No --> B
    C -- Yes --> D["View Nearby Drivers\nPOST /api/passenger/drivers/nearby"]

    D --> E["Submit Ride Request\nPOST /api/passenger/rides"]
    E --> F[System Validates Input via Zod]
    F --> G{Valid?}
    G -- No --> E
    G -- Yes --> H["Ride Created in DB\nstatus: REQUESTED"]

    H --> I["Trigger Driver Match\nPOST /api/passenger/rides/:id/match"]
    I --> J["Fetch All Available Drivers\nisAvailable = true"]
    J --> K[Filter by Valid GPS Coords]
    K --> L[Compute Haversine Distance\nfrom each driver to pickup]
    L --> M["Filter: distance ≤ maxRadiusKm\ndefault 10 km"]
    M --> N{Drivers Found?}
    N -- No --> O["Return: No Drivers Available\n404"]
    N -- Yes --> P[Sort by Distance\ntie-break: Rating DESC]
    P --> Q["Assign Nearest Driver\nRide status: ACCEPTED"]

    Q --> R["Driver Views Assignment\nGET /api/driver/rides"]
    R --> S{Accept or Reject?}
    S -- Reject --> T["PATCH /api/driver/rides/:id/reject\nstatus: REQUESTED again"]
    T --> I
    S -- Accept --> U["PATCH /api/driver/rides/:id/accept\nstatus: IN_PROGRESS"]

    U --> V[Ride In Progress]
    V --> W["Ride Completed\nstatus: COMPLETED"]
    W --> X([End])
    O --> X
```

#### Swimlane Diagram — Ride Request Sequence

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#ffb6c1', 'primaryBorderColor': '#e75480', 'primaryTextColor': '#1a1a1a', 'actorBkg': '#ffb6c1', 'actorBorder': '#e75480', 'activationBkgColor': '#ff8fab', 'noteBkgColor': '#ffb6c1'}}}%%
sequenceDiagram
    participant P as Passenger
    participant API as Express API
    participant MS as MatchingService
    participant DB as PostgreSQL (Prisma)
    participant D as Driver

    P->>API: POST /api/auth/login
    API->>DB: Lookup User record
    DB-->>API: User record
    API-->>P: JWT Token

    P->>API: POST /api/passenger/drivers/nearby
    API->>MS: findAvailableDrivers(pickup, options)
    MS->>DB: Query drivers WHERE isAvailable=true
    DB-->>MS: Driver list with coords
    MS-->>API: Sorted candidates (Haversine distance)
    API-->>P: Nearby drivers list

    P->>API: POST /api/passenger/rides
    API->>DB: INSERT Ride (status: REQUESTED)
    DB-->>API: Ride record
    API-->>P: Ride details

    P->>API: POST /api/passenger/rides/:id/match
    API->>MS: matchAndAssignDriver(rideId, options)
    MS->>DB: Find nearest available driver
    MS->>DB: UPDATE ride driverId and status to ACCEPTED
    DB-->>MS: Updated ride
    MS-->>API: MatchResult
    API-->>P: Assigned driver details

    D->>API: GET /api/driver/rides
    API->>DB: Query rides WHERE driverId = driver
    DB-->>API: Assigned rides
    API-->>D: Ride list

    D->>API: PATCH /api/driver/rides/:id/accept
    API->>DB: UPDATE ride status to IN_PROGRESS
    DB-->>API: Updated ride
    API-->>D: Confirmed

    D->>API: PATCH /api/driver/location
    API->>DB: UPDATE driver currentLat and currentLng
    DB-->>API: Updated location
    API-->>D: OK
```

---

### 2.3 Data Flow Diagrams

#### 2.3.1 — DFD Level 0: Context Diagram

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#ffb6c1', 'primaryBorderColor': '#e75480', 'primaryTextColor': '#1a1a1a', 'secondaryColor': '#ffb6c1', 'tertiaryColor': '#ffb6c1'}}}%%
graph LR
    P([Passenger]) -->|"Ride requests, Auth credentials, Location"| SYS[["UberLite System"]]
    SYS -->|"JWT Token, Ride status, Driver details"| P

    D([Driver]) -->|"Auth credentials, Availability, GPS Location"| SYS
    SYS -->|"JWT Token, Assigned rides, Ride status"| D

    SYS <-->|"Users, Rides, Drivers, Fares"| DB[(PostgreSQL DB)]
```

#### 2.3.2 — DFD Level 1

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#ffb6c1', 'primaryBorderColor': '#e75480', 'primaryTextColor': '#1a1a1a', 'secondaryColor': '#ffb6c1', 'tertiaryColor': '#ffb6c1'}}}%%
graph LR

  P([Passenger])
  D([Driver])

  A["1.0 Authentication"]
  R["2.0 Ride Management"]
  DM["3.0 Driver Management"]
  M["4.0 Driver Matching"]
  L["5.0 Location Services"]

  DB[(PostgreSQL)]

  P -->|Credentials| A
  D -->|Credentials| A
  A -->|JWT Token| P
  A -->|JWT Token| D
  A -->|User Data| DB

  P -->|Ride Request| R
  R -->|Ride Status| P
  R -->|Ride Record| DB

  D -->|Ride Action| DM
  D -->|Availability / GPS| DM
  DM -->|Driver Status| D
  DM -->|Driver Data| DB

  R -->|Pickup Location| M
  M -->|Driver Assignment| R
  M -->|Available Drivers| DB

  R -->|Coordinates| L
  L -->|Distance / Duration| R
```
#### 2.3.3 — DFD Level 2: Driver Matching Process (4.0)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': {'primaryColor': '#ffb6c1', 'primaryBorderColor': '#e75480', 'primaryTextColor': '#1a1a1a', 'secondaryColor': '#ffb6c1', 'tertiaryColor': '#ffb6c1'}}}%%
flowchart TD
    IN[/"Pickup Location lat and lng"/] --> V1["4.1 Validate and Normalize Coordinates"]
    OPT[/"Options: maxRadiusKm, vehicleType, limit"/] --> V1

    V1 --> Q["4.2 Query DB for Available Drivers\nisAvailable = true"]
    Q <-->|SQL Query| DB[(PostgreSQL)]
    DB -->|Raw driver records| F1

    F1["4.3 Filter: Valid GPS Coords"] --> C["4.4 Haversine Distance Calculation"]
    C --> F2["4.5 Radius Filter: distance ≤ maxRadiusKm"]

    F2 --> T["4.6 Estimate Arrival Time\nspeed = 30 km/h + 1 min buffer"]
    T --> S["4.7 Sort Candidates\nDistance ASC, Rating DESC"]
    S --> L["4.8 Apply Limit\ndefault: top 10"]

    L --> OUT[/"CandidateDriver list\ndistanceKm, estimatedArrivalMin"/]
    OUT --> A["4.9 Assign Nearest to Ride\nif Auto-Match triggered"]
    A <-->|UPDATE Ride| DB
```

---

### 2.5 User Stories

| ID | As a… | I want to… | So that… | Priority |
|---|---|---|---|---|
| US-01 | Passenger | Register with email, name, and password | I can access the UberLite platform | High |
| US-02 | Driver | Register with vehicle details and license number | I can accept rides on the platform | High |
| US-03 | Passenger | Log in and receive a JWT token | I can make authenticated API calls | High |
| US-04 | Passenger | Request a ride by entering pickup and drop-off address | The system can arrange a driver for me | High |
| US-05 | Passenger | See a list of drivers near my pickup location | I know drivers are available before booking | High |
| US-06 | Passenger | Have the system automatically match me with the nearest driver | I don't have to manually select a driver | High |
| US-07 | Passenger | View my ride history and individual ride details | I can track my past trips | Medium |
| US-08 | Driver | Toggle my availability on/off | I only receive rides when I'm ready to drive | High |
| US-09 | Driver | Update my current GPS location | The system can accurately match me to nearby passengers | High |
| US-10 | Driver | Accept or reject a ride assigned to me | I have control over which rides I take | High |
| US-11 | Driver | View my assigned and completed rides | I can track my ride history | Medium |
| US-12 | System | Compute Haversine distance between two coordinates | Driver-passenger proximity is accurately calculated | High |
| US-13 | System | Estimate travel arrival time | Passengers get an ETA for their matched driver | Medium |

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL
- npm

### Backend

```bash
cd code/backend
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npx prisma migrate dev
npm run dev
```

### Frontend

```bash
cd code/frontend
npm install
npm run dev
```

### Run Tests

```bash
cd code/backend
npm test
```
