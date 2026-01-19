# Sovry: Trade Fee (Native IP/ETH) vs Royalties (WIP) + `collectDexFees()` Test Suite

## 1) Story Protocol: apakah royalty/revenue bisa dibayar pakai native `IP`?

Berdasarkan dokumentasi Story Protocol, mekanisme pembayaran royalty/revenue **menggunakan token ERC20 yang di-*whitelist*** oleh `RoyaltyModule.sol`.

Referensi docs:
- https://docs.story.foundation/concepts/royalty-module/overview
  - Bagian **Whitelisted Payment Tokens** menjelaskan currency token yang boleh dipakai.
- https://docs.story.foundation/concepts/royalty-module/ip-royalty-vault
  - Menyebut **Whitelisted Payment Tokens**.
- https://docs.story.foundation/developers/smart-contracts-guide/claim-revenue
  - Contoh `payRoyaltyOnBehalf(..., address(MERC20), amount)` menunjukkan parameter pembayaran adalah **alamat ERC20**, bukan native.

Implikasi:
- Royalty/revenue di Story Protocol **secara desain berbasis ERC20** (mis. `WIP`) yang sudah di-whitelist.
- Native `IP` harus **dibungkus** (wrap) menjadi `WIP` jika ingin dipakai sebagai currency token.

## 2) Keputusan desain Sovry

Target behavior yang diinginkan:
- **Trade fee**: tetap dalam bentuk **native `IP`/`ETH`**.
- **Royalty/revenue**: diproses dalam bentuk **`WIP` (ERC20)**.

Sovry mengikuti pattern di atas:
- Trade (bonding curve buy/sell) memang native karena fungsi `buy()` adalah `payable`, dan semua pricing/reserve bonding curve berbasis native.
- Royalty/revenue mengikuti constraint Story (whitelisted ERC20), jadi **Sovry menerima dan mendistribusikan royalties dalam `WIP`**.

### Ringkas alur fee

1. **Trade fee (1% total)**
   - 50% ke **treasury** (melalui `pendingWithdrawals[treasury]`).
   - 50% dibayar sebagai **native IP/ETH** langsung ke **`ipAsset`**.
   - Semua ini terjadi **dalam native**.

2. **Royalties (`WIP`)**
   - `depositRoyalties(wrapperToken, wipAmount, amountOutMin)` menerima `WIP` (ERC20) dari keeper.
   - `wipAmount` diperlakukan sebagai jumlah revenue/royalty yang “claimed” oleh keeper, dan dicatat melalui event `RoyaltiesHarvested(wrapper, wipAmount)`.
   - 50% `WIP` dikirim ke **treasury**.
   - 50% `WIP` dikirim ke **`ipAsset`**.

Catatan penting: `amountOutMin` dipertahankan di signature untuk kompatibilitas, tapi **tidak digunakan** (karena tidak ada swap/buyback di kontrak).

## 3) Perubahan penting di kontrak

File utama: `contracts/src/core/SovryExchange.sol`

### A) `depositRoyalties()`
- Sekarang event `RoyaltiesHarvested(wrapper, amount)` mencatat **jumlah `WIP`** yang di-deposit.
- Distribusi:
  - 50% `WIP` ke `treasury`.
  - 50% `WIP` ke `token.ipAsset`.

### B) `collectDexFees()`
- Fee LP yang dikoleksi dari V3 PositionManager berbentuk:
  - `wrapperFees` (ERC20 wrapper token) → dibagi 50/50:
    - 50% wrapper ke `treasury`
    - 50% wrapper ke `ipAsset`
  - `wipFees` (ERC20 `WIP`) → dibagi 50/50:
    - 50% `WIP` ke `treasury`
    - 50% `WIP` ke `ipAsset`

Catatan penting: `amountOutMin` dipertahankan di signature untuk kompatibilitas, tapi **tidak digunakan** (karena tidak ada swap/buyback di kontrak).

## 4) Penjelasan lengkap test suite `collectDexFees()`

Lokasi: `contracts/test/Sovry_Chaos_Audit.test.ts` → `describe("collectDexFees", ...)`

### Helper: `launchAndGraduate()`
- Launch token.
- Force graduation threshold kecil agar cepat graduate.
- Melakukan 1 kali buy untuk memicu graduate.
- Memanggil `exchange.graduate(wrapper)`.
- Mengembalikan `wrapperAddress` dan `tokenId` (LP NFT id) yang disimpan exchange.

### Daftar test cases dan apa yang di-assert

1. **reverts when caller is not keeper**
   - Memastikan hanya address dengan `KEEPER_ROLE` yang bisa memanggil `collectDexFees()`.

2. **reverts when token is not graduated**
   - Memastikan `collectDexFees()` tidak bisa dipanggil sebelum graduation (karena belum ada LP NFT).

3. **reverts when graduated via fallback (tokenId=0)**
   - Saat mint LP NFT gagal (mock `revertMint=true`), exchange melakukan fallback graduation dan `lpTokenIds[wrapper]=0`.
   - `collectDexFees()` harus revert (karena tidak ada NFT untuk dikoleksi).

4. **distributes wrapper fees 50/50 to treasury and ipAsset**
   - Menset fee di mock PositionManager untuk sisi wrapper token.
   - Memanggil `collectDexFees()`.
   - Assert balance wrapper token milik `treasury` bertambah `wrapperFees/2`.
   - Assert balance wrapper token milik `ipAsset` bertambah `wrapperFees - wrapperFees/2`.

5. **distributes WIP fees 50/50 to treasury and ipAsset**
   - Menset fee di mock PositionManager untuk sisi `WIP`.
   - Assert balance `WIP` milik `treasury` bertambah `wipFees/2`.
   - Assert balance `WIP` milik `ipAsset` bertambah `wipFees - wipFees/2`.

6. **handles mixed token0/token1 ordering for combined fees**
   - Karena V3 positions menyimpan `token0/token1` berdasarkan address ordering.
   - Test memastikan mapping fee amounts (`amount0/amount1`) tetap benar walaupun wrapper bisa menjadi `token0` atau `token1`.
   - Assert split 50/50 untuk kedua token (wrapper dan WIP) tetap benar.

7. **does not revert when there are no fees to collect (no-op)**
   - Dengan fee balances 0, call `collectDexFees()` tidak revert.

8. **allows any amountOutMin value (unused) and does not revert**
   - Test memastikan `amountOutMin` memang **unused** (kompatibilitas signature), jadi nilai apapun tidak mengubah behavior dan tidak menyebabkan revert.

## 5) Kesimpulan

- **Trade fee**: native IP/ETH (sesuai bonding curve dan fungsi `payable`).
- **Royalty/revenue**: `WIP` (ERC20 whitelisted token) sesuai constraint Story Protocol.
- Test suite `collectDexFees()` memastikan:
  - Access control benar.
  - Token harus graduate dan memiliki LP NFT.
  - Fee collection dari LP V3 benar, termasuk edge-case ordering.
  - Fee split 50/50: `treasury` dan `ipAsset` menerima fee dalam token yang sama (wrapper dan/atau WIP).
