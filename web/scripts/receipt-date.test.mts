import { parseReceipt } from '../src/lib/receiptOcr.ts'
const today = new Date(2026, 10, 1) // 1 Nov 2026
const cases: [string, string | null][] = [
  ['Maybank2u\nTransfer Successful\nDate & Time: 28 Oct 2026 10:22:13\nReference No. 1234567890\nAmount RM 90.00', '2026-10-28'],
  ['CIMB Clicks\nTarikh Transaksi\n29/10/2026 09:15 PM\nNo. Rujukan 77889900\nJumlah RM50.00', '2026-10-29'],
  ['DuitNow Transfer\nTransaction Date 2026-10-30\nRef: DN12345678', '2026-10-30'],
  ['Bank Islam\n31 OKT 2026\nRM 120.00 berjaya', '2026-10-31'],
  ['RHB\nPayment date: Oct 27, 2026\nRM 10.00', '2026-10-27'],
  ['Public Bank\n01-11-26 08:01\nRM5.00', '2026-11-01'],
  ['Reference 2026110312345678\nDate 15/12/2026', null],              // future date is ignored
  ['Ref No 31/02/2026 nothing', null],                                   // impossible date
  ['Tarikh: 2 Mei 2026\nAmaun RM 30.00', '2026-05-02'],
  ['Generated 01/11/2026\nTransaction date 25/10/2026', '2026-10-25'],  // labelled line wins
]
let bad = 0
for (const [t, want] of cases) {
  const got = parseReceipt(t, today).paidOn
  if (got !== want) { bad++; console.log('FAIL', JSON.stringify(t), 'got', got, 'want', want) }
}
console.log(bad ? `${bad} FAILED` : `ALL ${cases.length} DATE CASES PASSED`)
