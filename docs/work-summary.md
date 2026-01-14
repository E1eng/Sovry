---
title: "Sovry /work Summary"
status: "draft"
last_updated: "2026-01-14"
---

# Tujuan Workflow `/work`
Workflow `/work` berfokus pada refactor arsitektur kontrak Sovry dari monolith `SovryLaunchpad.sol` menjadi 3 kontrak:

- `SovryFactory` (launching)
- `SovryExchange` (bonding curve + graduation + harvest)
- `SovryRouter` (UX gateway untuk user)

Sekaligus mengubah fee logic, event payload (agar subgraph bisa akurat tanpa “math inference”), menambahkan `AccessControl` (termasuk `KEEPER_ROLE` untuk `harvest`), dan merapikan wiring frontend + subgraph.

# Ringkasan Output Per Phase

## Phase 1 — Smart Contract Refactor
### Output utama
- `contracts/core/SovryFactory.sol`
- `contracts/core/SovryExchange.sol`
- `contracts/periphery/SovryRouter.sol`

### Perubahan arsitektur & invariant penting
- **Write entrypoint user** diarahkan ke `SovryRouter`:
  - Buy: `SovryRouter.buyETH(...)`
  - Sell: `SovryRouter.sell(...)`
- **Source of truth state reads** untuk token/curve berada di `SovryExchange`:
  - `getTokenState(wrapper)` mengembalikan struktur komposit `TokenState` + flag `curveActive`
  - mapping `wrapperToRt` / `rtToWrapper`
- **Harvest** (`SovryExchange.harvest(wrapper)`) adalah `KEEPER_ROLE` gated.
  - Frontend **tidak** mengirim tx harvest ke exchange
  - Backend/keeper yang menjalankan harvest

### Fee/event intent (sesuai workflow)
- Trade events `TokensPurchased` / `TokensSold` membawa `feeAmount` dan `feeRecipient`.
- Graduation mengambil fee dari reserve (split creator/treasury) sebelum LP.

## Phase 2 — Wiring & Deployment
### Output / wiring intent
- Deploy flow (high level):
  1. Deploy Exchange
  2. Deploy Factory (pointing ke Exchange)
  3. Deploy Router (pointing ke Factory + Exchange)
  4. Set permissions: set factory, grant `KEEPER_ROLE` ke bot

> Catatan: detail deploy script mengikuti struktur repo; pastikan env deploy sudah mengarah ke address yang benar (Factory/Exchange/Router).

## Phase 3 — Verification Test
- Target suite: `contracts/test/SovryProtocol.integration.test.ts`
- Validasi:
  - Launch via factory
  - Buy/sell via router
  - `harvest` hanya bisa oleh address ber-role `KEEPER_ROLE`

## Phase 4 — Subgraph Basic Setup (Goldsky)
### Perubahan manifest
- `subgraph/subgraph.yaml` diubah agar indexing berpusat pada:
  - `SovryFactory` (event `TokenLaunched`)
  - `SovryExchange` (trade/harvest/graduation events)

### Perubahan schema
- `GraduationEvent` diganti menjadi `Graduation` (entity + field alignment untuk frontend)

### Perubahan mapping
- `subgraph/src/launchpad.ts`
  - Handler factory: `handleTokenLaunched`
    - `Launchpad.id` ditetapkan sebagai **Exchange address** (`factory.exchange()`), bukan factory address
    - WrapperToken dibuat dan “best effort enrichment” lewat `exchange.launchedTokens(wrapper)`
  - Handler exchange:
    - `TokensPurchased` / `TokensSold` menyimpan `feeAmount` dari event
    - `Graduated` membuat entity `Graduation`

## Phase 4.5 — Frontend Contract Wiring (Router/Exchange)
### Tujuan
Frontend tidak lagi memperlakukan “launchpad address” sebagai satu kontrak; sekarang dibagi:

- **Router** untuk write (buy/sell/launch)
- **Exchange** untuk read state + approvals (spender)

### Perubahan penting (file-level)
- `frontend/src/services/domain/bondingCurve.service.ts`
  - Tambah `SOVRY_ROUTER_ADDRESS` + `SOVRY_EXCHANGE_ADDRESS`
  - Launch melalui router
  - Approve RT/Wrapper spender diarahkan ke Exchange

- `frontend/src/services/launchpadService.ts`
  - `buy` menggunakan `buyETH` (router)
  - `sell` approve spender ke `SOVRY_EXCHANGE_ADDRESS`
  - Reads: `getTokenState`/`getMarketCap` dari Exchange
  - `getCurveParams` menggunakan flag `curveActive` (bukan `curve.isActive` legacy)

- `frontend/src/hooks/useGraduationEvent.ts`
  - Watch `Graduated` event pada `SOVRY_EXCHANGE_ADDRESS`

- `frontend/src/hooks/useLiveTrades.ts`
  - Watch trade events pada `SOVRY_EXCHANGE_ADDRESS`
  - ABI trade events include `feeAmount` + `feeRecipient`

- `frontend/src/services/domain/royalty.service.ts`
  - Frontend hanya:
    - claim revenue ke IP account
    - transfer WIP ke Exchange
  - Tidak ada user-initiated `exchange.harvest()`

- `frontend/src/components/hero/ImmersiveHero.tsx`
  - Query `launchpad(id: ...)` memakai **Exchange address** (Launchpad entity id)

## Lean Cleanup (Legacy / Dead Code)
- Menghapus premine claim frontend (dead feature pada arsitektur baru):
  - `frontend/src/services/graduationService.ts`: hapus `getLatestPremineClaim` dan `PremineClaimInfo`
  - `frontend/src/app/profile/page.tsx`: hapus UI/handler/state “Premine”

# Status Saat Ini
## Selesai
- Wiring frontend Router/Exchange untuk buy/sell/read
- Watchers event diarahkan ke Exchange
- Harvest frontend tidak lagi call Exchange (KEEPER_ROLE)
- Query launchpad stats memakai Exchange id
- Premine claim feature dibersihkan dari frontend

## Pending / Next Steps
- **Subgraph codegen** memerlukan Node >= 20.18.1 (baru setelah itu aman ubah schema lebih agresif dan regenerate types).
- **Update backend worker** (`backend/services/royaltyHarvestService.js`) karena masih legacy:
  - Saat ini masih pakai `getAllLaunchedTokens()` + `harvestAndPump()` (legacy)
  - Arsitektur baru butuh:
    - sumber daftar wrapper (idealnya query Goldsky subgraph `wrapperTokens`)
    - call `exchange.harvest(wrapper)` sebagai keeper
- Update `README.md` & doc lama yang masih menyebut `SovryLaunchpad` monolith (optional, tapi disarankan).

# Checklist Environment Variables (Frontend)
Pastikan env berikut tersedia:
- `NEXT_PUBLIC_ROUTER_ADDRESS`
- `NEXT_PUBLIC_EXCHANGE_ADDRESS`
- `NEXT_PUBLIC_SUBGRAPH_URL`
- `NEXT_PUBLIC_STORY_RPC_URL` (optional)

# Catatan Risiko
- Jika `NEXT_PUBLIC_ROUTER_ADDRESS` / `NEXT_PUBLIC_EXCHANGE_ADDRESS` tidak di-set, fallback bisa terjadi (tergantung implementasi), tetapi hasilnya bisa misleading.
- Backend harvest tidak akan jalan sebelum migrasi dari ABI legacy.
