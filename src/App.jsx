import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "./hooks/useToast";
import { supabase } from "./lib/supabaseClient";

function createFeeItem() {
  return { id: crypto.randomUUID(), item: "", amount: "" };
}

function createInitialFeeItems() {
  return [createFeeItem(), createFeeItem(), createFeeItem()];
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function getFirstDateOfCurrentMonth() {
  const now = new Date();
  const firstDate = new Date(now.getFullYear(), now.getMonth(), 1);
  return firstDate.toISOString().split("T")[0];
}

function formatDateDDMMYYYY(value) {
  if (!value) {
    return "-";
  }
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}-${month}-${year}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toWholeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(Math.round(parsed), 0);
}

function sanitizeWholeInput(value) {
  if (value === "") {
    return "";
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return String(Math.max(Math.round(parsed), 0));
}

function getStoredSessionUser() {
  try {
    const raw = localStorage.getItem("aps_session_user");
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed?.username) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getMessageDirection(message) {
  const text = String(message || "");
  return /[\u0600-\u06FF]/.test(text) ? "rtl" : "ltr";
}

function getNextInvoiceNumber(records) {
  const maxNumeric = records.reduce((max, record) => {
    const text = String(record.invoiceNo || "");
    const match = text.match(/(\d+)/);
    if (!match) {
      return max;
    }
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return `INV-${String(maxNumeric + 1).padStart(4, "0")}`;
}

function transliterateRomanToUrdu(value) {
  const pairMap = {
    kh: "خ",
    gh: "غ",
    ch: "چ",
    sh: "ش",
    ph: "ف",
    zh: "ژ",
    aa: "ا",
    ee: "ی",
    oo: "و",
  };

  const baseMap = {
    a: "ا",
    b: "ب",
    c: "چ",
    d: "د",
    e: "ع",
    f: "ف",
    g: "گ",
    h: "ھ",
    i: "ی",
    j: "ج",
    k: "ک",
    l: "ل",
    m: "م",
    n: "ن",
    o: "ہ",
    p: "پ",
    q: "ق",
    r: "ر",
    s: "س",
    t: "ت",
    u: "ئ",
    v: "ط",
    w: "و",
    x: "ش",
    y: "ے",
    z: "ز",
  };

  const shiftMap = {
    A: "آ",
    B: "بھ",
    C: "ث",
    D: "ڈ",
    E: "ع",
    F: "ڈ",
    G: "غ",
    H: "ح",
    I: "ئ",
    J: "ض",
    K: "خ",
    L: "ڵ",
    M: "ں",
    N: "ں",
    O: "ۃ",
    P: "ُ",
    Q: "ق",
    R: "ڑ",
    S: "ص",
    T: "ٹ",
    U: "ء",
    V: "ظ",
    W: "ؤ",
    X: "ژ",
    Y: "ۓ",
    Z: "ذ",
  };

  let output = "";
  let i = 0;

  while (i < value.length) {
    const twoLower = value.slice(i, i + 2).toLowerCase();
    if (pairMap[twoLower]) {
      output += pairMap[twoLower];
      i += 2;
      continue;
    }

    const ch = value[i];
    if (shiftMap[ch]) {
      output += shiftMap[ch];
    } else if (baseMap[ch.toLowerCase()]) {
      output += baseMap[ch.toLowerCase()];
    } else {
      output += ch;
    }
    i += 1;
  }

  return output;
}

function mapDbPaymentToUiRecord(row) {
  const items = Array.isArray(row.fee_payment_items)
    ? [...row.fee_payment_items]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((item) => ({
          item: item.item_name || "",
          amount: toWholeNumber(item.amount),
        }))
    : [];

  return {
    id: row.id,
    createdAt: row.created_at,
    date: row.payment_date,
    studentName: row.student_name || "",
    fatherName: row.father_name || "",
    className: row.class_name || "",
    invoiceNo: row.invoice_no || "",
    feeItems: items,
    totalAmount: toWholeNumber(row.total_amount),
    amountReceived: toWholeNumber(row.amount_received),
    remainingAmount: toWholeNumber(row.remaining_amount),
  };
}

function mapDbExpenditureToUiRecord(row) {
  return {
    id: row.id,
    date: row.expense_date,
    title: row.title || "",
    amount: toWholeNumber(row.amount),
    notes: row.notes || "",
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function getInvoicePrintHtml(record) {
  const items = Array.isArray(record.feeItems) ? record.feeItems : [];
  const targetRows = 10;
  const paddedItems = [...items];
  while (paddedItems.length < targetRows) {
    paddedItems.push({ item: "", amount: "" });
  }

  const rowsHtml = paddedItems
    .map(
      (item, index) => `
        <tr>
          <td>${item.item ? index + 1 : ""}</td>
          <td>${item.item || ""}</td>
          <td>${item.amount === "" ? "" : item.amount}</td>
        </tr>
      `
    )
    .join("");

  const copyHtml = (copyTitle) => `
    <section class="copy">
      <div class="copy-tag">${copyTitle}</div>
      <h1 class="school">الحرم پبلک سکول اینڈ اقرا اکیڈمی</h1>
      <p class="address">مسلم سٹی روڈ بالو، ضلع نوشہرہ - <bdi class="num-ltr">0315-9498390</bdi></p>

      <div class="meta">
        <span>انوائس نمبر: <bdi class="num-ltr">${record.invoiceNo || "-"}</bdi></span>
        <span class="meta-title">فیس رسید</span>
        <span>تاریخ: <bdi class="date-ltr">${formatDateDDMMYYYY(record.date)}</bdi></span>
      </div>

      <table class="mini">
        <tr>
          <th>طالب علم</th>
          <th>والد</th>
          <th>کلاس</th>
        </tr>
        <tr>
          <td>${record.studentName || "-"}</td>
          <td>${record.fatherName || "-"}</td>
          <td>${record.className || "-"}</td>
        </tr>
      </table>

      <table class="items">
        <tr>
          <th class="sno">نمبر شمار</th>
          <th>تفصیل</th>
          <th class="amt">رقم</th>
        </tr>
        ${rowsHtml}
      </table>

      <div class="bottom">
        <div class="notes">
          ${
            copyTitle === "OFFICE COPY"
              ? ""
              : '<p><strong>وصول کنندہ:</strong> __________</p>'
          }
        </div>
        <table class="totals">
          <tr><th>کل</th><td>${record.totalAmount}</td></tr>
          <tr><th>وصول</th><td>${record.amountReceived}</td></tr>
          <tr><th>بقایا</th><td>${record.remainingAmount}</td></tr>
        </table>
      </div>

      <div class="footer-note">یہ کمپیوٹر سے تیار کردہ رسید ہے</div>
    </section>
  `;

  return `
    <!doctype html>
    <html lang="ur" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Fee Invoice ${record.invoiceNo || ""}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap');
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", "Noto Naskh Arabic", Tahoma, sans-serif;
            color: #111;
          }
          .sheet {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 18px;
            padding: 10px;
            position: relative;
          }
          .sheet::after {
            content: "";
            position: absolute;
            top: 10px;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            border-left: 1px dashed #666;
            pointer-events: none;
          }
          .copy { border: 1px solid #222; padding: 10px; min-height: 96vh; position: relative; }
          .copy-tag {
            border: 1px solid #111;
            padding: 2px 10px;
            font-size: 8px;
            width: fit-content;
            margin: 0 auto 6px;
            direction: ltr;
            text-align: center;
            font-family: "Segoe UI", Tahoma, sans-serif;
            font-weight: 700;
          }
          .school { margin: 18px 0 2px; text-align: center; font-size: 40px; line-height: 1.2; }
          .address { margin: 0 0 10px; text-align: center; font-size: 18px; font-weight: 700; line-height: 1.2; }
          .meta {
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
            font-size: 18px;
            margin-bottom: 8px;
            border-top: 1px solid #111;
            border-bottom: 1px solid #111;
            padding: 6px 0;
          }
          .meta span:first-child { text-align: right; }
          .meta span:last-child { text-align: left; }
          .meta-title { text-align: center; font-weight: 700; }
          .date-ltr, .num-ltr { direction: ltr; unicode-bidi: isolate; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #111; padding: 6px 8px; text-align: center; font-size: 24px; line-height: 1.25; }
          .mini { margin-bottom: 10px; }
          .items { direction: rtl; }
          .mini th,
          .items th { background: #f4f4f4; }
          .items tr { height: 48px; }
          .items .sno { width: 56px; text-align: center; }
          .items .amt { width: 120px; text-align: center; }
          .items td:nth-child(2), .items th:nth-child(2) { text-align: right; }
          .bottom { margin-top: 10px; display: grid; grid-template-columns: 1fr 220px; gap: 10px; align-items: end; }
          .notes p { margin: 2px 0; font-size: 21px; }
          .totals th { text-align: right; background: #f4f4f4; }
          .totals td { width: 90px; font-weight: 700; }
          .footer-note { margin-top: 14px; font-size: 17px; text-align: center; }
          @media print {
            @page { size: A5 landscape; margin: 4mm; }
            body {
              font-size: 12px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .sheet {
              padding: 0;
              gap: 4mm;
              grid-template-columns: 1fr 1fr;
              align-items: stretch;
            }
            .sheet::after {
              top: 0;
              bottom: 0;
              border-left: 0.4mm dashed #555;
            }
            .copy {
              min-height: 0;
              height: 137mm;
              padding: 3mm;
              page-break-after: auto;
              break-inside: avoid;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .copy-tag { font-size: 9px; margin-bottom: 3px; padding: 1px 8px; }
            .school { font-size: 28px; margin: 4px 0 0; line-height: 1.1; }
            .address { font-size: 14px; margin: 0 0 5px; line-height: 1.1; }
            .meta {
              font-size: 12px;
              padding: 4px 0;
              margin-bottom: 6px;
            }
            th, td {
              font-size: 12px;
              padding: 3px 4px;
              line-height: 1.15;
            }
            .mini { margin-bottom: 6px; }
            .items tr { height: 22px; }
            .bottom {
              margin-top: 6px;
              grid-template-columns: 1fr 128px;
              gap: 6px;
            }
            .notes p { margin: 1px 0; font-size: 12px; }
            .totals td { width: 58px; }
            .footer-note { margin-top: 6px; font-size: 11px; }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          ${copyHtml("STUDENT COPY")}
          ${copyHtml("OFFICE COPY")}
        </div>
      </body>
    </html>
  `;
}

function getHistoryPdfHtml(records) {
  const generatedOn = new Date();
  const generatedDate = formatDateDDMMYYYY(generatedOn.toISOString().split("T")[0]);
  const totalCollected = records.reduce((sum, row) => sum + toWholeNumber(row.amountReceived), 0);
  const totalRemaining = records.reduce((sum, row) => sum + toWholeNumber(row.remainingAmount), 0);
  const totalBilled = records.reduce((sum, row) => sum + toWholeNumber(row.totalAmount), 0);

  const rowsHtml = records
    .map((record) => {
      const itemsHtml =
        record.feeItems && record.feeItems.length
          ? record.feeItems
              .map((item) => `${escapeHtml(item.item || "-")} (${escapeHtml(item.amount || 0)})`)
              .join(", ")
          : "-";

      return `
        <tr>
          <td class="mono">${escapeHtml(record.invoiceNo || "-")}</td>
          <td class="mono">${escapeHtml(formatDateDDMMYYYY(record.date))}</td>
          <td>${escapeHtml(record.studentName || "-")}</td>
          <td>${escapeHtml(record.fatherName || "-")}</td>
          <td>${escapeHtml(record.className || "-")}</td>
          <td class="items-full">${itemsHtml}</td>
          <td class="num">${escapeHtml(record.totalAmount)}</td>
          <td class="num">${escapeHtml(record.amountReceived)}</td>
          <td class="num">${escapeHtml(record.remainingAmount)}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Payment History Report</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: #111;
            background: #fff;
            padding: 8mm;
          }
          .head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 8px;
            border-bottom: 1px solid #d7dce3;
            padding-bottom: 6px;
          }
          h1 { margin: 0; font-size: 19px; letter-spacing: 0.01em; }
          .meta {
            color: #5b6470;
            font-size: 12px;
            text-align: right;
            line-height: 1.5;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
            margin: 8px 0 10px;
          }
          .summary-card {
            border: 1px solid #d7dce3;
            background: #f7f9fc;
            border-radius: 6px;
            padding: 6px 8px;
          }
          .summary-card .label {
            font-size: 11px;
            color: #5b6470;
            margin-bottom: 2px;
          }
          .summary-card .value {
            font-size: 15px;
            font-weight: 700;
            color: #111827;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
          }
          th, td {
            border: 1px solid #d7dce3;
            padding: 5px 6px;
            font-size: 11px;
            text-align: left;
            vertical-align: middle;
            overflow-wrap: anywhere;
          }
          th {
            background: #edf2f7;
            font-weight: 700;
            color: #1f2937;
          }
          .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .items-full { line-height: 1.35; }
          th:nth-child(1) { width: 8%; }
          th:nth-child(2) { width: 8%; }
          th:nth-child(3) { width: 14%; }
          th:nth-child(4) { width: 14%; }
          th:nth-child(5) { width: 6%; }
          th:nth-child(6) { width: 24%; }
          th:nth-child(7), th:nth-child(8), th:nth-child(9) { width: 8.6%; }
          .empty {
            margin-top: 16px;
            border: 1px dashed #aaa;
            padding: 12px;
            color: #555;
          }
          @media print {
            @page { size: A4 landscape; margin: 8mm; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="head">
          <h1>Payment History Report</h1>
          <div class="meta">
            Generated on: ${escapeHtml(generatedDate)}<br />
            Records: ${records.length}
          </div>
        </div>
        <div class="summary">
          <div class="summary-card">
            <div class="label">Total Billed</div>
            <div class="value">${escapeHtml(totalBilled)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Collected</div>
            <div class="value">${escapeHtml(totalCollected)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Remaining</div>
            <div class="value">${escapeHtml(totalRemaining)}</div>
          </div>
          <div class="summary-card">
            <div class="label">Total Invoices</div>
            <div class="value">${records.length}</div>
          </div>
        </div>
        ${
          records.length
            ? `<table>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Student</th>
                    <th>Father</th>
                    <th>Class</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Received</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>`
            : '<div class="empty">No records found for current filters.</div>'
        }
      </body>
    </html>
  `;
}

function getExpenditurePdfHtml(records) {
  const generatedOn = new Date();
  const generatedDate = formatDateDDMMYYYY(generatedOn.toISOString().split("T")[0]);
  const totalAmount = records.reduce((sum, row) => sum + toWholeNumber(row.amount), 0);

  const rowsHtml = records
    .map(
      (record) => `
        <tr>
          <td>${escapeHtml(formatDateDDMMYYYY(record.date))}</td>
          <td>${escapeHtml(record.title || "-")}</td>
          <td class="num">${escapeHtml(record.amount)}</td>
          <td>${escapeHtml(record.notes || "-")}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Expenditure Report</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: #111;
            background: #fff;
            padding: 10mm;
          }
          .head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
            border-bottom: 1px solid #d7dce3;
            padding-bottom: 6px;
          }
          h1 { margin: 0; font-size: 20px; }
          .meta {
            color: #5b6470;
            font-size: 12px;
            text-align: right;
            line-height: 1.45;
          }
          .summary {
            margin-bottom: 10px;
            font-size: 13px;
            color: #334155;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #d7dce3;
            padding: 6px 8px;
            font-size: 12px;
            text-align: left;
            vertical-align: middle;
          }
          th {
            background: #edf2f7;
            font-weight: 700;
          }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .empty {
            border: 1px dashed #aaa;
            padding: 12px;
            color: #555;
          }
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="head">
          <h1>Expenditure Report</h1>
          <div class="meta">
            Generated on: ${escapeHtml(generatedDate)}<br />
            Records: ${records.length}
          </div>
        </div>
        <div class="summary">Total Expenditure: <strong>${escapeHtml(totalAmount)}</strong></div>
        ${
          records.length
            ? `<table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Title</th>
                    <th>Amount</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>`
            : '<div class="empty">No expenditure records found for current filters.</div>'
        }
      </body>
    </html>
  `;
}

function getDashboardPdfHtml(data, isPrivate = false) {
  const mask = (value) => (isPrivate ? "Hidden" : value);
  const generatedOn = formatDateDDMMYYYY(getTodayDate());

  const monthlyRows = (data.monthlyComparisonSeries || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(mask(row.label))}</td>
          <td class="num">${escapeHtml(mask(row.income))}</td>
          <td class="num">${escapeHtml(mask(row.expense))}</td>
          <td class="num">${escapeHtml(mask(row.net))}</td>
          <td class="num">${escapeHtml(mask(row.invoices))}</td>
          <td class="num">${escapeHtml(mask(row.expenseEntries))}</td>
        </tr>
      `
    )
    .join("");

  const dailyRows = (data.dailyComparisonSeries || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(mask(row.label))}</td>
          <td class="num">${escapeHtml(mask(row.income))}</td>
          <td class="num">${escapeHtml(mask(row.expense))}</td>
          <td class="num">${escapeHtml(mask(row.net))}</td>
          <td class="num">${escapeHtml(mask(row.invoices))}</td>
          <td class="num">${escapeHtml(mask(row.expenseEntries))}</td>
        </tr>
      `
    )
    .join("");

  const outstandingRows = (data.outstandingRecords || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(mask(row.invoiceNo || "-"))}</td>
          <td>${escapeHtml(mask(row.studentName || "-"))}</td>
          <td class="num">${escapeHtml(mask(row.remainingAmount))}</td>
        </tr>
      `
    )
    .join("");

  const topExpenseRows = (data.topExpenditureRecords || [])
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(mask(formatDateDDMMYYYY(row.date)))}</td>
          <td>${escapeHtml(mask(row.title || "-"))}</td>
          <td class="num">${escapeHtml(mask(row.amount))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dashboard Report</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, sans-serif;
            color: #111;
            background: #fff;
            padding: 10mm;
          }
          .head {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
            border-bottom: 1px solid #d7dce3;
            padding-bottom: 6px;
          }
          h1 { margin: 0; font-size: 20px; }
          .meta { font-size: 12px; color: #5b6470; text-align: right; line-height: 1.45; }
          .kpis {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 6px;
            margin: 10px 0 12px;
          }
          .kpi {
            border: 1px solid #d7dce3;
            background: #f7f9fc;
            border-radius: 6px;
            padding: 6px 8px;
          }
          .kpi span { display: block; font-size: 11px; color: #5b6470; margin-bottom: 2px; }
          .kpi strong { font-size: 15px; }
          h2 {
            margin: 12px 0 6px;
            font-size: 14px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid #d7dce3;
            padding: 6px 8px;
            font-size: 12px;
            text-align: left;
            vertical-align: middle;
          }
          th { background: #edf2f7; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-top: 10px;
          }
          @media print {
            @page { size: A4 portrait; margin: 10mm; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="head">
          <h1>Fee Collection Dashboard Report</h1>
          <div class="meta">
            Generated on: ${escapeHtml(generatedOn)}<br />
            Range: ${escapeHtml(formatDateDDMMYYYY(data.dateFrom))} to ${escapeHtml(
    formatDateDDMMYYYY(data.dateTo)
  )}<br />
            Fee invoices: ${escapeHtml(mask(data.invoiceCount))} | Expense entries: ${escapeHtml(mask(data.expenseCount))}
          </div>
        </div>

        <div class="kpis">
          <div class="kpi"><span>Total Fee Collected</span><strong>${escapeHtml(mask(data.totals.collected))}</strong></div>
          <div class="kpi"><span>Total Expenditure</span><strong>${escapeHtml(mask(data.totals.spent))}</strong></div>
          <div class="kpi"><span>Cash in Hand</span><strong>${escapeHtml(mask(data.totals.cashInHand))}</strong></div>
          <div class="kpi"><span>Total Invoices / Expenditures</span><strong>${escapeHtml(mask(data.invoiceCount))} / ${escapeHtml(
            mask(
            data.expenseCount
            )
          )}</strong></div>
          <div class="kpi"><span>Collection This Month</span><strong>${escapeHtml(mask(data.monthCollected))}</strong></div>
          <div class="kpi"><span>Spent This Month</span><strong>${escapeHtml(mask(data.monthSpent))}</strong></div>
          <div class="kpi"><span>Collection Today</span><strong>${escapeHtml(mask(data.todayCollected))}</strong></div>
          <div class="kpi"><span>Spent Today</span><strong>${escapeHtml(mask(data.todaySpent))}</strong></div>
        </div>

        <h2>Monthly Income vs Expenditure</h2>
        <table>
          <thead>
            <tr><th>Month</th><th>Fee Income</th><th>Expenditure</th><th>Net</th><th>Invoices</th><th>Expenses</th></tr>
          </thead>
          <tbody>${monthlyRows || '<tr><td colspan="6">No records available.</td></tr>'}</tbody>
        </table>

        <h2>Daily Income vs Expenditure</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Fee Income</th><th>Expenditure</th><th>Net</th><th>Invoices</th><th>Expenses</th></tr>
          </thead>
          <tbody>${dailyRows || '<tr><td colspan="6">No records available.</td></tr>'}</tbody>
        </table>

        <div class="grid">
          <div>
            <h2>Highest Outstanding</h2>
            <table>
              <thead><tr><th>Invoice</th><th>Student</th><th>Outstanding</th></tr></thead>
              <tbody>${outstandingRows || '<tr><td colspan="3">No outstanding records.</td></tr>'}</tbody>
            </table>
          </div>
          <div>
            <h2>Largest Expenditures</h2>
            <table>
              <thead><tr><th>Date</th><th>Title</th><th>Amount</th></tr></thead>
              <tbody>${topExpenseRows || '<tr><td colspan="3">No expenditure records.</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;
}
export default function App() {
  const [currentUser, setCurrentUser] = useState(getStoredSessionUser);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getStoredSessionUser()));
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activePage, setActivePage] = useState("home");
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [date, setDate] = useState(getTodayDate);
  const [studentName, setStudentName] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [studentClass, setStudentClass] = useState("");
  const [invoiceNo, setInvoiceNo] = useState(() => getNextInvoiceNumber([]));
  const [feeItems, setFeeItems] = useState(createInitialFeeItems);
  const [amountReceived, setAmountReceived] = useState("0");
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyClassFilter, setHistoryClassFilter] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState(getFirstDateOfCurrentMonth);
  const [historyDateTo, setHistoryDateTo] = useState(getTodayDate);
  const [dashboardDateFrom, setDashboardDateFrom] = useState(getFirstDateOfCurrentMonth);
  const [dashboardDateTo, setDashboardDateTo] = useState(getTodayDate);
  const [isDashboardPrivate, setIsDashboardPrivate] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [printConfirmRecord, setPrintConfirmRecord] = useState(null);
  const [isPrintPromptEnabled, setIsPrintPromptEnabled] = useState(() => {
    const stored = localStorage.getItem("aps_print_prompt_enabled");
    return stored === null ? true : stored === "true";
  });
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [historyInlineEditId, setHistoryInlineEditId] = useState(null);
  const [historyInlineDraft, setHistoryInlineDraft] = useState(null);
  const [expenditureDate, setExpenditureDate] = useState(getTodayDate);
  const [expenditureTitle, setExpenditureTitle] = useState("");
  const [expenditureAmount, setExpenditureAmount] = useState("");
  const [expenditureNotes, setExpenditureNotes] = useState("");
  const [expenditureSearch, setExpenditureSearch] = useState("");
  const [expenditureDateFrom, setExpenditureDateFrom] = useState(getFirstDateOfCurrentMonth);
  const [expenditureDateTo, setExpenditureDateTo] = useState(getTodayDate);
  const [expenditureHistory, setExpenditureHistory] = useState([]);
  const [isLoadingExpenditures, setIsLoadingExpenditures] = useState(false);
  const [isSavingExpenditure, setIsSavingExpenditure] = useState(false);
  const [editingExpenditureId, setEditingExpenditureId] = useState(null);
  const [editingExpenditureDraft, setEditingExpenditureDraft] = useState(null);

  const studentNameRef = useRef(null);
  const firstItemNameRef = useRef(null);
  const printConfirmButtonRef = useRef(null);
  const loginFormRef = useRef(null);
  const { toasts, toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) {
      localStorage.removeItem("aps_session_user");
      return;
    }
    if (currentUser?.username) {
      localStorage.setItem("aps_session_user", JSON.stringify(currentUser));
    }
  }, [isAuthenticated, currentUser]);

  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem("aps_print_prompt_enabled", String(isPrintPromptEnabled));
  }, [isPrintPromptEnabled]);

  useEffect(() => {
    if (activePage === "collect-fee") {
      window.setTimeout(() => {
        studentNameRef.current?.focus();
      }, 0);
    }
  }, [activePage]);

  useEffect(() => {
    if (!printConfirmRecord) {
      return;
    }

    window.setTimeout(() => {
      printConfirmButtonRef.current?.focus();
    }, 0);
  }, [printConfirmRecord]);

  useEffect(() => {
    if (!supabase || !isAuthenticated) {
      return;
    }

    let isMounted = true;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      const { data, error } = await supabase
        .from("fee_payments")
        .select(
          "id,invoice_no,payment_date,student_name,father_name,class_name,total_amount,amount_received,remaining_amount,created_at,fee_payment_items(item_name,amount,sort_order)"
        )
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        toast.error("Supabase سے ہسٹری لوڈ نہیں ہو سکی۔");
        setIsLoadingHistory(false);
        return;
      }

      const mapped = (data || []).map(mapDbPaymentToUiRecord);
      setPaymentHistory(mapped);
      setInvoiceNo(getNextInvoiceNumber(mapped));
      setIsLoadingHistory(false);
    };

    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [toast, isAuthenticated]);

  useEffect(() => {
    if (!supabase || !isAuthenticated) {
      setExpenditureHistory([]);
      return;
    }

    let isMounted = true;

    const loadExpenditures = async () => {
      setIsLoadingExpenditures(true);
      const { data, error } = await supabase
        .from("expenditures")
        .select("id,expense_date,title,amount,notes,created_at,updated_at")
        .order("created_at", { ascending: false });

      if (!isMounted) {
        return;
      }

      if (error) {
        toast.error("Expenditure records could not be loaded.");
        setIsLoadingExpenditures(false);
        return;
      }

      setExpenditureHistory((data || []).map(mapDbExpenditureToUiRecord));
      setIsLoadingExpenditures(false);
    };

    loadExpenditures();
    return () => {
      isMounted = false;
    };
  }, [toast, isAuthenticated]);

  const setUrduOnlyValue = (setter, value) => {
    setter(transliterateRomanToUrdu(value));
  };

  const totalAmount = useMemo(() => {
    return feeItems.reduce((sum, fee) => {
      return sum + toWholeNumber(fee.amount);
    }, 0);
  }, [feeItems]);

  const remainingAmount = useMemo(() => {
    const safeReceived = toWholeNumber(amountReceived);
    return Math.max(totalAmount - safeReceived, 0);
  }, [totalAmount, amountReceived]);

  const classFilterOptions = useMemo(() => {
    return Array.from(
      new Set(paymentHistory.map((record) => record.className).filter((value) => value))
    );
  }, [paymentHistory]);

  const filteredPaymentHistory = useMemo(() => {
    const search = historySearch.trim().toLowerCase();

    return [...paymentHistory]
      .filter((record) => {
        const matchesSearch =
          !search ||
          record.studentName.toLowerCase().includes(search) ||
          record.fatherName.toLowerCase().includes(search) ||
          record.className.toLowerCase().includes(search) ||
          String(record.invoiceNo || "").toLowerCase().includes(search);

        const matchesClass = !historyClassFilter || record.className === historyClassFilter;
        const matchesDateFrom = !historyDateFrom || record.date >= historyDateFrom;
        const matchesDateTo = !historyDateTo || record.date <= historyDateTo;

        return matchesSearch && matchesClass && matchesDateFrom && matchesDateTo;
      })
      .sort((a, b) => {
        const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }, [paymentHistory, historySearch, historyClassFilter, historyDateFrom, historyDateTo]);

  const dashboardData = useMemo(() => {
    const paymentsInRange = paymentHistory.filter((record) => {
      const matchesDateFrom = !dashboardDateFrom || record.date >= dashboardDateFrom;
      const matchesDateTo = !dashboardDateTo || record.date <= dashboardDateTo;
      return matchesDateFrom && matchesDateTo;
    });

    const expendituresInRange = expenditureHistory.filter((record) => {
      const matchesDateFrom = !dashboardDateFrom || record.date >= dashboardDateFrom;
      const matchesDateTo = !dashboardDateTo || record.date <= dashboardDateTo;
      return matchesDateFrom && matchesDateTo;
    });

    const totals = paymentsInRange.reduce(
      (acc, record) => {
        acc.billed += record.totalAmount;
        acc.collected += record.amountReceived;
        acc.outstanding += record.remainingAmount;
        return acc;
      },
      { billed: 0, collected: 0, outstanding: 0 }
    );

    const totalSpent = expendituresInRange.reduce((sum, record) => sum + toWholeNumber(record.amount), 0);
    const netCollection = totals.collected - totalSpent;
    const cashInHand = netCollection;
    const invoiceCount = paymentsInRange.length;
    const expenseCount = expendituresInRange.length;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const monthPrefix = `${year}-${month}`;

    const monthCollected = paymentsInRange
      .filter((record) => String(record.date || "").startsWith(monthPrefix))
      .reduce((sum, record) => sum + record.amountReceived, 0);
    const monthSpent = expendituresInRange
      .filter((record) => String(record.date || "").startsWith(monthPrefix))
      .reduce((sum, record) => sum + toWholeNumber(record.amount), 0);

    const todayDate = getTodayDate();
    const todayCollected = paymentsInRange
      .filter((record) => record.date === todayDate)
      .reduce((sum, record) => sum + record.amountReceived, 0);
    const todaySpent = expendituresInRange
      .filter((record) => record.date === todayDate)
      .reduce((sum, record) => sum + toWholeNumber(record.amount), 0);

    const monthlyIncomeMap = paymentsInRange.reduce((map, record) => {
      const key = String(record.date || "").slice(0, 7);
      if (!key) {
        return map;
      }
      if (!map[key]) {
        map[key] = { income: 0, invoices: 0 };
      }
      map[key].income += record.amountReceived;
      map[key].invoices += 1;
      return map;
    }, {});

    const monthlyExpenseMap = expendituresInRange.reduce((map, record) => {
      const key = String(record.date || "").slice(0, 7);
      if (!key) {
        return map;
      }
      if (!map[key]) {
        map[key] = { expense: 0, expenses: 0 };
      }
      map[key].expense += toWholeNumber(record.amount);
      map[key].expenses += 1;
      return map;
    }, {});

    const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
    const monthlyKeys = Array.from(
      new Set([...Object.keys(monthlyIncomeMap), ...Object.keys(monthlyExpenseMap)])
    )
      .sort((a, b) => a.localeCompare(b))
      .slice(-6);

    const monthlyComparisonSeries = monthlyKeys.map((key) => {
      const [rowYear, rowMonth] = key.split("-").map(Number);
      const labelDate = new Date(rowYear, (rowMonth || 1) - 1, 1);
      const income = monthlyIncomeMap[key]?.income || 0;
      const expense = monthlyExpenseMap[key]?.expense || 0;
      return {
        label: monthFormatter.format(labelDate),
        income,
        expense,
        net: income - expense,
        invoices: monthlyIncomeMap[key]?.invoices || 0,
        expenseEntries: monthlyExpenseMap[key]?.expenses || 0,
      };
    });

    const dailyIncomeMap = paymentsInRange.reduce((map, record) => {
      const key = String(record.date || "");
      if (!key) {
        return map;
      }
      if (!map[key]) {
        map[key] = { income: 0, invoices: 0 };
      }
      map[key].income += record.amountReceived;
      map[key].invoices += 1;
      return map;
    }, {});

    const dailyExpenseMap = expendituresInRange.reduce((map, record) => {
      const key = String(record.date || "");
      if (!key) {
        return map;
      }
      if (!map[key]) {
        map[key] = { expense: 0, expenses: 0 };
      }
      map[key].expense += toWholeNumber(record.amount);
      map[key].expenses += 1;
      return map;
    }, {});

    const dailyKeys = Array.from(new Set([...Object.keys(dailyIncomeMap), ...Object.keys(dailyExpenseMap)]))
      .sort((a, b) => a.localeCompare(b))
      .slice(-7);

    const dailyComparisonSeries = dailyKeys.map((key) => {
      const income = dailyIncomeMap[key]?.income || 0;
      const expense = dailyExpenseMap[key]?.expense || 0;
      return {
        label: formatDateDDMMYYYY(key),
        income,
        expense,
        net: income - expense,
        invoices: dailyIncomeMap[key]?.invoices || 0,
        expenseEntries: dailyExpenseMap[key]?.expenses || 0,
      };
    });

    const outstandingRecords = paymentsInRange
      .filter((record) => record.remainingAmount > 0)
      .sort((a, b) => b.remainingAmount - a.remainingAmount)
      .slice(0, 5);

    const topExpenditureRecords = [...expendituresInRange]
      .sort((a, b) => toWholeNumber(b.amount) - toWholeNumber(a.amount))
      .slice(0, 5);

    return {
      dateFrom: dashboardDateFrom,
      dateTo: dashboardDateTo,
      invoiceCount,
      expenseCount,
      totals: {
        ...totals,
        spent: totalSpent,
        netCollection,
        cashInHand,
      },
      monthCollected,
      monthSpent,
      todayCollected,
      todaySpent,
      monthlyComparisonSeries,
      dailyComparisonSeries,
      outstandingRecords,
      topExpenditureRecords,
    };
  }, [paymentHistory, expenditureHistory, dashboardDateFrom, dashboardDateTo]);

  const updateFeeItem = (id, field, value) => {
    const nextValue =
      field === "item" ? transliterateRomanToUrdu(value) : sanitizeWholeInput(value);
    setFeeItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: nextValue } : item))
    );
  };

  const addFeeItem = () => {
    setFeeItems((current) => [...current, createFeeItem()]);
  };

  const removeFeeItem = (id) => {
    setFeeItems((current) => {
      const next = current.filter((item) => item.id !== id);
      return next.length ? next : [createFeeItem()];
    });
  };

  const handleReset = (options = {}) => {
    const { keepDate = false } = options;
    if (!keepDate) {
      setDate(getTodayDate());
    }
    setStudentName("");
    setFatherName("");
    setStudentClass("");
    setEditingPaymentId(null);
    setInvoiceNo(getNextInvoiceNumber(paymentHistory));
    setFeeItems(createInitialFeeItems());
    setAmountReceived("0");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const hasOneCompleteFeeItem = feeItems.some(
      (item) => item.item.trim() && toWholeNumber(item.amount) > 0
    );

    if (!hasOneCompleteFeeItem) {
      toast.error("کم از کم ایک فیس آئٹم میں نام اور رقم درج کریں۔");
      return;
    }

    const wholeAmountReceived = toWholeNumber(amountReceived);

    if (wholeAmountReceived > totalAmount) {
      toast.error("وصول شدہ رقم کل رقم سے زیادہ نہیں ہو سکتی۔");
      return;
    }

    const cleanFeeItems = feeItems
      .map((item) => ({
        item: item.item.trim(),
        amount: toWholeNumber(item.amount),
      }))
      .filter((item) => item.item || item.amount > 0);

    const finalInvoiceNo = invoiceNo.trim() || getNextInvoiceNumber(paymentHistory);

    const record = {
      id: editingPaymentId || crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      date,
      studentName: studentName.trim(),
      fatherName: fatherName.trim(),
      className: studentClass.trim(),
      invoiceNo: finalInvoiceNo,
      feeItems: cleanFeeItems,
      totalAmount: toWholeNumber(totalAmount),
      amountReceived: wholeAmountReceived,
      remainingAmount: toWholeNumber(remainingAmount),
    };

    setIsSavingPayment(true);
    let updatedHistory = editingPaymentId
      ? paymentHistory.map((item) => (item.id === editingPaymentId ? record : item))
      : [record, ...paymentHistory];

    if (supabase) {
      const payload = {
        invoice_no: record.invoiceNo,
        payment_date: record.date,
        student_name: record.studentName,
        father_name: record.fatherName,
        class_name: record.className,
        total_amount: record.totalAmount,
        amount_received: record.amountReceived,
      };

      const paymentQuery = editingPaymentId
        ? supabase
            .from("fee_payments")
            .update(payload)
            .eq("id", editingPaymentId)
            .select(
              "id,invoice_no,payment_date,student_name,father_name,class_name,total_amount,amount_received,remaining_amount,created_at"
            )
            .single()
        : supabase
            .from("fee_payments")
            .insert(payload)
            .select(
              "id,invoice_no,payment_date,student_name,father_name,class_name,total_amount,amount_received,remaining_amount,created_at"
            )
            .single();

      const { data: paymentRow, error: paymentError } = await paymentQuery;

      if (paymentError) {
        setIsSavingPayment(false);
        toast.error(editingPaymentId ? "ادائیگی اپڈیٹ نہیں ہو سکی۔" : "ادائیگی محفوظ نہیں ہو سکی۔");
        return;
      }

      if (editingPaymentId) {
        const { error: deleteItemsError } = await supabase
          .from("fee_payment_items")
          .delete()
          .eq("payment_id", paymentRow.id);
        if (deleteItemsError) {
          setIsSavingPayment(false);
          toast.error("پرانے آئٹمز حذف نہیں ہو سکے۔");
          return;
        }
      }

      if (record.feeItems.length > 0) {
        const itemRows = record.feeItems.map((item, index) => ({
          payment_id: paymentRow.id,
          item_name: item.item,
          amount: item.amount,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase.from("fee_payment_items").insert(itemRows);
        if (itemsError) {
          if (!editingPaymentId) {
            await supabase.from("fee_payments").delete().eq("id", paymentRow.id);
          }
          setIsSavingPayment(false);
          toast.error("آئٹمز محفوظ نہیں ہو سکے۔");
          return;
        }
      }

      const mappedRow = mapDbPaymentToUiRecord({
        ...paymentRow,
        fee_payment_items: record.feeItems.map((item, index) => ({
          item_name: item.item,
          amount: item.amount,
          sort_order: index,
        })),
      });

      updatedHistory = editingPaymentId
        ? paymentHistory.map((item) => (item.id === editingPaymentId ? mappedRow : item))
        : [mappedRow, ...paymentHistory];
    }

    const savedRecord =
      supabase
        ? updatedHistory.find((item) => item.id === (editingPaymentId || updatedHistory[0]?.id))
        : record;

    setPaymentHistory(updatedHistory);
    setIsSavingPayment(false);

    toast.success(editingPaymentId ? "ادائیگی کامیابی سے اپڈیٹ ہو گئی۔" : "ادائیگی کامیابی سے محفوظ ہو گئی۔");
    if (savedRecord && isPrintPromptEnabled) {
      setPrintConfirmRecord(savedRecord);
    }
    handleReset({ keepDate: true });
    setInvoiceNo(getNextInvoiceNumber(updatedHistory));
    window.setTimeout(() => {
      studentNameRef.current?.focus();
    }, 0);
  };

  const startInlineEdit = (record) => {
    if (!record) {
      return;
    }
    setHistoryInlineEditId(record.id);
    setHistoryInlineDraft({
      invoiceNo: record.invoiceNo || "",
      date: record.date || getTodayDate(),
      studentName: record.studentName || "",
      fatherName: record.fatherName || "",
      className: record.className || "",
      amountReceived: String(toWholeNumber(record.amountReceived)),
      feeItems:
        (record.feeItems || []).length > 0
          ? record.feeItems.map((item) => ({
              id: crypto.randomUUID(),
              item: item.item || "",
              amount: String(toWholeNumber(item.amount)),
            }))
          : [{ id: crypto.randomUUID(), item: "", amount: "" }],
    });
  };

  const handleInlineHistoryDraftChange = (field, value) => {
    setHistoryInlineDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        [field]: field === "amountReceived" ? sanitizeWholeInput(value) : value,
      };
    });
  };

  const handleInlineHistoryUrduDraftChange = (field, value) => {
    setHistoryInlineDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        [field]: transliterateRomanToUrdu(value),
      };
    });
  };

  const handleInlineHistoryItemChange = (itemId, field, value) => {
    setHistoryInlineDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        feeItems: (current.feeItems || []).map((item) =>
          item.id === itemId
            ? {
                ...item,
                [field]:
                  field === "amount"
                    ? sanitizeWholeInput(value)
                    : transliterateRomanToUrdu(value),
              }
            : item
        ),
      };
    });
  };

  const addInlineHistoryItem = () => {
    setHistoryInlineDraft((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        feeItems: [...(current.feeItems || []), { id: crypto.randomUUID(), item: "", amount: "" }],
      };
    });
  };

  const removeInlineHistoryItem = (itemId) => {
    setHistoryInlineDraft((current) => {
      if (!current) {
        return current;
      }
      const nextItems = (current.feeItems || []).filter((item) => item.id !== itemId);
      return {
        ...current,
        feeItems: nextItems.length > 0 ? nextItems : [{ id: crypto.randomUUID(), item: "", amount: "" }],
      };
    });
  };

  const cancelInlineHistoryEdit = () => {
    setHistoryInlineEditId(null);
    setHistoryInlineDraft(null);
  };

  const saveInlineHistoryEdit = async () => {
    if (!historyInlineEditId || !historyInlineDraft) {
      return;
    }

    const currentRecord = paymentHistory.find((item) => item.id === historyInlineEditId);
    if (!currentRecord) {
      cancelInlineHistoryEdit();
      return;
    }

    const cleanFeeItems = (historyInlineDraft.feeItems || [])
      .map((item) => ({
        item: String(item.item || "").trim(),
        amount: toWholeNumber(item.amount),
      }))
      .filter((item) => item.item || item.amount > 0);

    const hasOneCompleteFeeItem = cleanFeeItems.some(
      (item) => item.item.trim() && toWholeNumber(item.amount) > 0
    );
    if (!hasOneCompleteFeeItem) {
      toast.error("کم از کم ایک فیس آئٹم میں نام اور رقم درج کریں۔");
      return;
    }

    const nextTotalAmount = cleanFeeItems.reduce((sum, item) => sum + toWholeNumber(item.amount), 0);
    const nextAmountReceived = toWholeNumber(historyInlineDraft.amountReceived);
    if (nextAmountReceived > nextTotalAmount) {
      toast.error("وصول شدہ رقم کل رقم سے زیادہ نہیں ہو سکتی۔");
      return;
    }

    const updatedRecord = {
      ...currentRecord,
      invoiceNo: historyInlineDraft.invoiceNo.trim() || currentRecord.invoiceNo,
      date: historyInlineDraft.date || currentRecord.date,
      studentName: historyInlineDraft.studentName.trim(),
      fatherName: historyInlineDraft.fatherName.trim(),
      className: historyInlineDraft.className.trim(),
      feeItems: cleanFeeItems,
      totalAmount: nextTotalAmount,
      amountReceived: nextAmountReceived,
      remainingAmount: Math.max(nextTotalAmount - nextAmountReceived, 0),
    };

    if (supabase) {
      const payload = {
        invoice_no: updatedRecord.invoiceNo,
        payment_date: updatedRecord.date,
        student_name: updatedRecord.studentName,
        father_name: updatedRecord.fatherName,
        class_name: updatedRecord.className,
        total_amount: updatedRecord.totalAmount,
        amount_received: updatedRecord.amountReceived,
      };

      const { data, error } = await supabase
        .from("fee_payments")
        .update(payload)
        .eq("id", historyInlineEditId)
        .select(
          "id,invoice_no,payment_date,student_name,father_name,class_name,total_amount,amount_received,remaining_amount,created_at"
        )
        .single();

      if (error) {
        toast.error("ریکارڈ اپڈیٹ نہیں ہو سکا۔");
        return;
      }

      const { error: deleteItemsError } = await supabase
        .from("fee_payment_items")
        .delete()
        .eq("payment_id", historyInlineEditId);

      if (deleteItemsError) {
        toast.error("پرانے آئٹمز حذف نہیں ہو سکے۔");
        return;
      }

      if (updatedRecord.feeItems.length > 0) {
        const itemRows = updatedRecord.feeItems.map((item, index) => ({
          payment_id: historyInlineEditId,
          item_name: item.item,
          amount: item.amount,
          sort_order: index,
        }));

        const { error: itemsError } = await supabase.from("fee_payment_items").insert(itemRows);
        if (itemsError) {
          toast.error("آئٹمز محفوظ نہیں ہو سکے۔");
          return;
        }
      }

      updatedRecord.totalAmount = toWholeNumber(data.total_amount);
      updatedRecord.amountReceived = toWholeNumber(data.amount_received);
      updatedRecord.remainingAmount = toWholeNumber(data.remaining_amount);
      updatedRecord.createdAt = data.created_at;
    }

    setPaymentHistory((current) =>
      current.map((item) => (item.id === historyInlineEditId ? updatedRecord : item))
    );
    toast.success("ریکارڈ اپڈیٹ ہو گیا۔");
    cancelInlineHistoryEdit();
  };

  const handleDeleteFromHistory = async (recordId) => {
    if (!window.confirm("Delete this payment record?")) {
      return;
    }

    if (supabase) {
      const { error } = await supabase.from("fee_payments").delete().eq("id", recordId);
      if (error) {
        toast.error("Record delete نہیں ہو سکا۔");
        return;
      }
    }

    setPaymentHistory((current) => current.filter((item) => item.id !== recordId));
    if (historyInlineEditId === recordId) {
      cancelInlineHistoryEdit();
    }
    if (editingPaymentId === recordId) {
      handleReset();
    }
    toast.success("Record deleted.");
  };

  const handlePrintFromHistoryContext = (recordId) => {
    const record = paymentHistory.find((item) => item.id === recordId);
    if (!record) {
      return;
    }
    handlePrintInvoice(record);
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    const username = loginUsername.trim();
    const password = loginPassword;

    if (!username || !password) {
      toast.error("Username and password are required.");
      return;
    }

    setIsLoggingIn(true);

    if (!supabase) {
      setIsLoggingIn(false);
      toast.error("Supabase is not configured.");
      return;
    }

    const { data, error } = await supabase.rpc("verify_user_login", {
      p_username: username,
      p_password: password,
    });

    if (error) {
      setIsLoggingIn(false);
      toast.error("Login failed.");
      return;
    }

    const userRow = Array.isArray(data) ? data[0] : data;
    if (!userRow?.username) {
      setIsLoggingIn(false);
      toast.error("Invalid username or password.");
      return;
    }

    setCurrentUser({
      username: userRow.username,
      fullName: userRow.full_name || userRow.username,
      role: userRow.role || "user",
    });
    setIsAuthenticated(true);
    setLoginPassword("");
    setIsLoggingIn(false);
    toast.success("Login successful.");
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActivePage("home");
    setLoginPassword("");
    toast.info("Logged out.");
  };

  const handleLoginKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loginFormRef.current?.requestSubmit();
    }
  };

  const confirmPrintAfterSave = () => {
    const restoreNameFocus = () => {
      window.setTimeout(() => {
        studentNameRef.current?.focus();
      }, 0);
    };

    if (printConfirmRecord) {
      const onWindowFocus = () => {
        restoreNameFocus();
        window.removeEventListener("focus", onWindowFocus);
      };
      window.addEventListener("focus", onWindowFocus);
      handlePrintInvoice(printConfirmRecord);
    }
    setPrintConfirmRecord(null);
    restoreNameFocus();
  };

  const skipPrintAfterSave = () => {
    setPrintConfirmRecord(null);
    window.setTimeout(() => {
      studentNameRef.current?.focus();
    }, 0);
  };

  const handlePrintConfirmKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmPrintAfterSave();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      skipPrintAfterSave();
    }
  };

  const handlePrintInvoice = (record) => {
    const html = getInvoicePrintHtml(record);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const printUrl = URL.createObjectURL(blob);
    const printWindow = window.open(printUrl, "_blank", "width=1280,height=900");

    if (!printWindow) {
      toast.error("پرنٹ ونڈو نہیں کھل سکی۔");
      URL.revokeObjectURL(printUrl);
      return;
    }

    const triggerPrint = () => {
      printWindow.focus();
      printWindow.print();
      setTimeout(() => {
        URL.revokeObjectURL(printUrl);
      }, 2000);
    };

    if (printWindow.document.readyState === "complete") {
      triggerPrint();
    } else {
      printWindow.addEventListener("load", triggerPrint, { once: true });
    }
  };

  const handleExportHistoryPdf = () => {
    const html = getHistoryPdfHtml(filteredPaymentHistory);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const exportWindow = window.open(exportUrl, "_blank", "width=1280,height=900");

    if (!exportWindow) {
      toast.error("Export window نہیں کھل سکی۔");
      URL.revokeObjectURL(exportUrl);
      return;
    }

    const triggerPrint = () => {
      exportWindow.focus();
      exportWindow.print();
      setTimeout(() => {
        URL.revokeObjectURL(exportUrl);
      }, 2000);
    };

    if (exportWindow.document.readyState === "complete") {
      triggerPrint();
    } else {
      exportWindow.addEventListener("load", triggerPrint, { once: true });
    }
  };

  const handleExportDashboardPdf = () => {
    const html = getDashboardPdfHtml(dashboardData, isDashboardPrivate);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const exportWindow = window.open(exportUrl, "_blank", "width=1280,height=900");

    if (!exportWindow) {
      toast.error("Export window could not be opened.");
      URL.revokeObjectURL(exportUrl);
      return;
    }

    const triggerPrint = () => {
      exportWindow.focus();
      exportWindow.print();
      setTimeout(() => {
        URL.revokeObjectURL(exportUrl);
      }, 2000);
    };

    if (exportWindow.document.readyState === "complete") {
      triggerPrint();
    } else {
      exportWindow.addEventListener("load", triggerPrint, { once: true });
    }
  };

  const handleExpenditureSubmit = async (event) => {
    event.preventDefault();
    const title = expenditureTitle.trim();
    const amount = toWholeNumber(expenditureAmount);

    if (!title) {
      toast.error("Please enter expenditure title.");
      return;
    }

    if (amount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }

    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }

    setIsSavingExpenditure(true);
    const payload = {
      expense_date: expenditureDate,
      title,
      amount,
      notes: expenditureNotes.trim(),
    };

    const { data, error } = await supabase
      .from("expenditures")
      .insert(payload)
      .select("id,expense_date,title,amount,notes,created_at,updated_at")
      .single();

    setIsSavingExpenditure(false);
    if (error) {
      toast.error("Expenditure could not be saved.");
      return;
    }

    setExpenditureHistory((current) => [mapDbExpenditureToUiRecord(data), ...current]);
    setExpenditureTitle("");
    setExpenditureAmount("");
    setExpenditureNotes("");
    toast.success("Expenditure saved.");
  };

  const handleDeleteExpenditure = async (recordId) => {
    if (!window.confirm("Delete this expenditure record?")) {
      return;
    }

    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }

    const { error } = await supabase.from("expenditures").delete().eq("id", recordId);
    if (error) {
      toast.error("Expenditure could not be deleted.");
      return;
    }

    setExpenditureHistory((current) => current.filter((item) => item.id !== recordId));
    if (editingExpenditureId === recordId) {
      setEditingExpenditureId(null);
      setEditingExpenditureDraft(null);
    }
    toast.success("Expenditure deleted.");
  };

  const startExpenditureEdit = (record) => {
    setEditingExpenditureId(record.id);
    setEditingExpenditureDraft({
      date: record.date || getTodayDate(),
      title: record.title || "",
      amount: String(toWholeNumber(record.amount)),
      notes: record.notes || "",
    });
  };

  const cancelExpenditureEdit = () => {
    setEditingExpenditureId(null);
    setEditingExpenditureDraft(null);
  };

  const saveExpenditureEdit = async () => {
    if (!editingExpenditureId || !editingExpenditureDraft) {
      return;
    }
    const nextTitle = String(editingExpenditureDraft.title || "").trim();
    const nextAmount = toWholeNumber(editingExpenditureDraft.amount);
    if (!nextTitle) {
      toast.error("Please enter expenditure title.");
      return;
    }
    if (nextAmount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }

    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }

    const payload = {
      expense_date: editingExpenditureDraft.date || getTodayDate(),
      title: nextTitle,
      amount: nextAmount,
      notes: String(editingExpenditureDraft.notes || "").trim(),
    };

    const { data, error } = await supabase
      .from("expenditures")
      .update(payload)
      .eq("id", editingExpenditureId)
      .select("id,expense_date,title,amount,notes,created_at,updated_at")
      .single();

    if (error) {
      toast.error("Expenditure could not be updated.");
      return;
    }

    const mapped = mapDbExpenditureToUiRecord(data);
    setExpenditureHistory((current) =>
      current.map((item) => (item.id === editingExpenditureId ? mapped : item))
    );
    cancelExpenditureEdit();
    toast.success("Expenditure updated.");
  };

  const filteredExpenditureHistory = useMemo(() => {
    const search = expenditureSearch.trim().toLowerCase();
    return [...expenditureHistory]
      .filter((record) => {
        const matchesSearch =
          !search ||
          String(record.title || "").toLowerCase().includes(search) ||
          String(record.notes || "").toLowerCase().includes(search);
        const matchesDateFrom = !expenditureDateFrom || record.date >= expenditureDateFrom;
        const matchesDateTo = !expenditureDateTo || record.date <= expenditureDateTo;
        return matchesSearch && matchesDateFrom && matchesDateTo;
      })
      .sort((a, b) => {
        const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });
  }, [expenditureHistory, expenditureSearch, expenditureDateFrom, expenditureDateTo]);

  const filteredExpenditureTotal = useMemo(
    () => filteredExpenditureHistory.reduce((sum, item) => sum + toWholeNumber(item.amount), 0),
    [filteredExpenditureHistory]
  );
  const totalExpenditure = useMemo(
    () => expenditureHistory.reduce((sum, item) => sum + toWholeNumber(item.amount), 0),
    [expenditureHistory]
  );

  const handleExportExpenditurePdf = () => {
    const html = getExpenditurePdfHtml(filteredExpenditureHistory);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const exportUrl = URL.createObjectURL(blob);
    const exportWindow = window.open(exportUrl, "_blank", "width=1280,height=900");

    if (!exportWindow) {
      toast.error("Export window could not be opened.");
      URL.revokeObjectURL(exportUrl);
      return;
    }

    const triggerPrint = () => {
      exportWindow.focus();
      exportWindow.print();
      setTimeout(() => {
        URL.revokeObjectURL(exportUrl);
      }, 2000);
    };

    if (exportWindow.document.readyState === "complete") {
      triggerPrint();
    } else {
      exportWindow.addEventListener("load", triggerPrint, { once: true });
    }
  };

  if (!isAuthenticated) {
    return (
      <main className={`app-shell login-shell ${isDarkMode ? "theme-dark" : ""}`}>
        <section className="card login-card">
          <div className="login-head">
            <h1>Fee Collection Management</h1>
            <p>Sign in to continue.</p>
          </div>
          <form
            ref={loginFormRef}
            className="login-form"
            onSubmit={handleLoginSubmit}
            onKeyDown={handleLoginKeyDown}
          >
            <label className="field">
              <span>Username</span>
              <input
                type="text"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={isLoggingIn}>
                {isLoggingIn ? "Signing in..." : "Login"}
              </button>
            </div>
          </form>
        </section>
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((item) => (
            <div
              className={`toast toast-${item.type} ${item.isClosing ? "is-closing" : ""}`}
              style={{ "--toast-duration": `${item.duration || 3200}ms` }}
              key={item.id}
            >
              <span className="toast-message" dir={getMessageDirection(item.message)}>
                {item.message}
              </span>
              <button
                type="button"
                className="toast-close"
                onClick={() => toast.dismiss(item.id)}
                aria-label="Close"
              >
                ×
              </button>
              <div className="toast-progress" aria-hidden="true" />
            </div>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell ${isDarkMode ? "theme-dark" : ""}`}>
      <header className="app-header">
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle header-icon-btn theme-btn"
            onClick={() => setIsDarkMode((prev) => !prev)}
            aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            title={isDarkMode ? "Light mode" : "Dark mode"}
          >
            {isDarkMode ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="theme-toggle header-icon-btn logout-btn"
            onClick={handleLogout}
            aria-label="Logout"
            title="Logout"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        </div>
        <div className="app-title-wrap">
          <div className="app-title">Fee Collection Management</div>
        </div>
        <nav className="app-nav" aria-label="Page navigation">
          <button
            type="button"
            className={`nav-link ${activePage === "home" ? "is-active" : ""}`}
            onClick={() => setActivePage("home")}
          >
            Home
          </button>
          <button
            type="button"
            className={`nav-link ${activePage === "collect-fee" ? "is-active" : ""}`}
            onClick={() => setActivePage("collect-fee")}
          >
            Collect Fee
          </button>
          <button
            type="button"
            className={`nav-link ${activePage === "history" ? "is-active" : ""}`}
            onClick={() => setActivePage("history")}
          >
            History
          </button>
          <button
            type="button"
            className={`nav-link ${activePage === "expenditure" ? "is-active" : ""}`}
            onClick={() => setActivePage("expenditure")}
          >
            Expenditure
          </button>
        </nav>
      </header>

      {activePage === "home" ? (
        <section className="card dashboard-card">
          <div className="history-head">
            <div className="history-head-info">
              <h2>Dashboard</h2>
              <span className="history-count">
                Fee invoices: {isDashboardPrivate ? "••••" : dashboardData.invoiceCount} | Expense entries: {isDashboardPrivate ? "••••" : dashboardData.expenseCount}
              </span>
            </div>
            <div className="dashboard-inline-filters">
              <input
                className="mini-filter date-filter"
                type="date"
                title="From Date"
                aria-label="Dashboard from date"
                value={dashboardDateFrom}
                onChange={(event) => setDashboardDateFrom(event.target.value)}
              />
              <input
                className="mini-filter date-filter"
                type="date"
                title="To Date"
                aria-label="Dashboard to date"
                value={dashboardDateTo}
                onChange={(event) => setDashboardDateTo(event.target.value)}
              />
            </div>
            <button
              type="button"
              className={`btn btn-secondary history-export-btn${isDashboardPrivate ? " privacy-active" : ""}`}
              onClick={() => setIsDashboardPrivate((prev) => !prev)}
              title={isDashboardPrivate ? "Show amounts" : "Hide amounts"}
              aria-label={isDashboardPrivate ? "Show amounts" : "Hide amounts"}
            >
              {isDashboardPrivate ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ verticalAlign: "middle", marginInlineEnd: 4 }}>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" style={{ verticalAlign: "middle", marginInlineEnd: 4 }}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
              {isDashboardPrivate ? "Show" : "Hide"}
            </button>
            <button type="button" className="btn btn-secondary history-export-btn" onClick={handleExportDashboardPdf}>
              Export PDF
            </button>
          </div>

          {isLoadingHistory || isLoadingExpenditures ? (
            <div className="history-empty">Loading dashboard data...</div>
          ) : (() => {
            const m = (v) => (isDashboardPrivate ? "••••" : v);
            return (
            <div className="dashboard-layout">
              <div className="dashboard-kpis">
                <article className="kpi-card">
                  <span>Total Fee Collected</span>
                  <strong>{m(dashboardData.totals.collected)}</strong>
                </article>
                <article className="kpi-card">
                  <span>Total Expenditure</span>
                  <strong>{m(dashboardData.totals.spent)}</strong>
                </article>
                <article className="kpi-card">
                  <span>Total Invoices / Expenditures</span>
                  <strong>
                    {m(dashboardData.invoiceCount)} / {m(dashboardData.expenseCount)}
                  </strong>
                </article>
                <article className="kpi-card">
                  <span>Cash in Hand</span>
                  <strong>{m(dashboardData.totals.cashInHand)}</strong>
                </article>
                <article className="kpi-card">
                  <span>Collection This Month</span>
                  <strong>{m(dashboardData.monthCollected)}</strong>
                </article>
                <article className="kpi-card">
                  <span>Spent This Month</span>
                  <strong>{m(dashboardData.monthSpent)}</strong>
                </article>
                <article className="kpi-card">
                  <span>Collection Today</span>
                  <strong>{m(dashboardData.todayCollected)}</strong>
                </article>
                <article className="kpi-card">
                  <span>Spent Today</span>
                  <strong>{m(dashboardData.todaySpent)}</strong>
                </article>
              </div>

              <div className="dashboard-panels">
                <section className="dashboard-panel">
                  <div className="panel-head">
                    <h3>Monthly Income vs Expenditure</h3>
                    <span>Last 6 months</span>
                  </div>
                  {dashboardData.monthlyComparisonSeries.length === 0 ? (
                    <div className="history-empty">No records available.</div>
                  ) : (
                    <div className="dashboard-mini-table-wrap">
                      <table className="history-table dashboard-mini-table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Fee Income</th>
                            <th>Expenditure</th>
                            <th>Net</th>
                            <th>Invoices</th>
                            <th>Expenses</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.monthlyComparisonSeries.map((row) => (
                            <tr key={row.label}>
                              <td>{m(row.label)}</td>
                              <td>{m(row.income)}</td>
                              <td>{m(row.expense)}</td>
                              <td>{m(row.net)}</td>
                              <td>{m(row.invoices)}</td>
                              <td>{m(row.expenseEntries)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="dashboard-panel">
                  <div className="panel-head">
                    <h3>Daily Income vs Expenditure</h3>
                    <span>Last 7 days</span>
                  </div>
                  {dashboardData.dailyComparisonSeries.length === 0 ? (
                    <div className="history-empty">No records available.</div>
                  ) : (
                    <div className="dashboard-mini-table-wrap">
                      <table className="history-table dashboard-mini-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Fee Income</th>
                            <th>Expenditure</th>
                            <th>Net</th>
                            <th>Invoices</th>
                            <th>Expenses</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.dailyComparisonSeries.map((row) => (
                            <tr key={row.label}>
                              <td>{m(row.label)}</td>
                              <td>{m(row.income)}</td>
                              <td>{m(row.expense)}</td>
                              <td>{m(row.net)}</td>
                              <td>{m(row.invoices)}</td>
                              <td>{m(row.expenseEntries)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

              <div className="dashboard-panels">
                <section className="dashboard-panel">
                  <div className="panel-head">
                    <h3>Highest Outstanding</h3>
                  </div>
                  {dashboardData.outstandingRecords.length === 0 ? (
                    <div className="history-empty">No outstanding records.</div>
                  ) : (
                    <div className="dashboard-list">
                      {dashboardData.outstandingRecords.map((record) => (
                        <div className="dashboard-list-row" key={`due-${record.id}`}>
                          <span>{m(record.invoiceNo)}</span>
                          <span>{m(record.studentName || "-")}</span>
                          <span>{m(record.remainingAmount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="dashboard-panel">
                  <div className="panel-head">
                    <h3>Largest Expenditures</h3>
                  </div>
                  {dashboardData.topExpenditureRecords.length === 0 ? (
                    <div className="history-empty">No expenditure records.</div>
                  ) : (
                    <div className="dashboard-list">
                      {dashboardData.topExpenditureRecords.map((record) => (
                        <div className="dashboard-list-row" key={`exp-${record.id}`}>
                          <span>{m(formatDateDDMMYYYY(record.date))}</span>
                          <span>{m(record.title || "-")}</span>
                          <span>{m(record.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          );})()}
        </section>
      ) : activePage === "history" ? (
        <section className="card history-card">
          <div className="history-head">
            <div className="history-inline-filters">
              <input
                className="mini-filter search-filter"
                type="text"
                aria-label="Search"
                placeholder="Student / Father / Class"
                value={historySearch}
                onChange={(e) => setUrduOnlyValue(setHistorySearch, e.target.value)}
              />

              <select
                className="mini-filter class-filter"
                aria-label="Class filter"
                value={historyClassFilter}
                onChange={(e) => setHistoryClassFilter(e.target.value)}
              >
                <option value="">All Classes</option>
                {classFilterOptions.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>

              <input
                className="mini-filter date-filter"
                type="date"
                title="From Date"
                aria-label="From date"
                value={historyDateFrom}
                onChange={(e) => setHistoryDateFrom(e.target.value)}
              />

              <input
                className="mini-filter date-filter"
                type="date"
                title="To Date"
                aria-label="To date"
                value={historyDateTo}
                onChange={(e) => setHistoryDateTo(e.target.value)}
              />

              <button type="button" className="btn btn-secondary history-export-btn" onClick={handleExportHistoryPdf}>
                Export PDF
              </button>
            </div>

            <div className="history-head-info">
              <h2>Payment History</h2>
              <span className="history-count">
                Showing: {filteredPaymentHistory.length} / {paymentHistory.length}
              </span>
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="history-empty">ہسٹری لوڈ ہو رہی ہے...</div>
          ) : paymentHistory.length === 0 ? (
            <div className="history-empty">ابھی تک کوئی ادائیگی محفوظ نہیں ہوئی۔</div>
          ) : filteredPaymentHistory.length === 0 ? (
            <div className="history-empty">فلٹر کے مطابق کوئی ریکارڈ نہیں ملا۔</div>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>انوائس نمبر</th>
                    <th>تاریخ</th>
                    <th>طالب علم</th>
                    <th>والد</th>
                    <th>کلاس</th>
                    <th>آئٹمز</th>
                    <th>کل رقم</th>
                    <th>وصول</th>
                    <th>بقایا</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPaymentHistory.map((record) => {
                    const isInlineEditing = historyInlineEditId === record.id;
                    const inlineItems = isInlineEditing ? historyInlineDraft?.feeItems || [] : [];
                    const inlineTotalAmount = isInlineEditing
                      ? inlineItems.reduce((sum, item) => sum + toWholeNumber(item.amount), 0)
                      : record.totalAmount;
                    const itemsText = (record.feeItems || []).length
                      ? record.feeItems
                          .map((item) => `${item.item || "Unnamed"} (${toWholeNumber(item.amount)})`)
                          .join(", ")
                      : "کوئی آئٹم نہیں";
                    const inlineReceived = isInlineEditing
                      ? toWholeNumber(historyInlineDraft?.amountReceived)
                      : record.amountReceived;
                    const inlineRemaining = Math.max(toWholeNumber(inlineTotalAmount) - inlineReceived, 0);

                    return (
                      <Fragment key={record.id}>
                        <tr>
                          <td>
                            {isInlineEditing ? (
                              <input
                                className="history-inline-input"
                                type="text"
                                value={historyInlineDraft?.invoiceNo || ""}
                                onChange={(event) =>
                                  handleInlineHistoryDraftChange("invoiceNo", event.target.value)
                                }
                              />
                            ) : (
                              record.invoiceNo || "-"
                            )}
                          </td>
                          <td>
                            {isInlineEditing ? (
                              <input
                                className="history-inline-input"
                                type="date"
                                value={historyInlineDraft?.date || getTodayDate()}
                                onChange={(event) =>
                                  handleInlineHistoryDraftChange("date", event.target.value)
                                }
                              />
                            ) : (
                              <bdi dir="ltr">{formatDateDDMMYYYY(record.date)}</bdi>
                            )}
                          </td>
                          <td>
                            {isInlineEditing ? (
                              <input
                                className="history-inline-input"
                                type="text"
                                lang="ur"
                                dir="rtl"
                                value={historyInlineDraft?.studentName || ""}
                                onChange={(event) =>
                                  handleInlineHistoryUrduDraftChange("studentName", event.target.value)
                                }
                              />
                            ) : (
                              record.studentName || "-"
                            )}
                          </td>
                          <td>
                            {isInlineEditing ? (
                              <input
                                className="history-inline-input"
                                type="text"
                                lang="ur"
                                dir="rtl"
                                value={historyInlineDraft?.fatherName || ""}
                                onChange={(event) =>
                                  handleInlineHistoryUrduDraftChange("fatherName", event.target.value)
                                }
                              />
                            ) : (
                              record.fatherName || "-"
                            )}
                          </td>
                          <td>
                            {isInlineEditing ? (
                              <input
                                className="history-inline-input"
                                type="text"
                                value={historyInlineDraft?.className || ""}
                                onChange={(event) =>
                                  handleInlineHistoryDraftChange("className", event.target.value)
                                }
                              />
                            ) : (
                              record.className || "-"
                            )}
                          </td>
                          <td className="history-items-cell">
                            {itemsText}
                          </td>
                          <td>{isInlineEditing ? inlineTotalAmount : record.totalAmount}</td>
                          <td>
                            {isInlineEditing ? (
                              <input
                                className="history-inline-input"
                                type="number"
                                min="0"
                                step="1"
                                value={historyInlineDraft?.amountReceived || ""}
                                onChange={(event) =>
                                  handleInlineHistoryDraftChange("amountReceived", event.target.value)
                                }
                              />
                            ) : (
                              record.amountReceived
                            )}
                          </td>
                          <td>{isInlineEditing ? inlineRemaining : record.remainingAmount}</td>
                          <td className="history-actions-cell">
                            <div className="history-actions-wrap">
                              {isInlineEditing ? (
                                <div className="history-inline-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary history-action-icon-btn"
                                    onClick={saveInlineHistoryEdit}
                                    title="Save"
                                    aria-label="Save"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn"
                                    onClick={cancelInlineHistoryEdit}
                                    title="Cancel"
                                    aria-label="Cancel"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <div className="history-row-actions">
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn"
                                    onClick={() => handlePrintFromHistoryContext(record.id)}
                                    title="Print"
                                    aria-label="Print"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M6 9V2h12v7" />
                                      <rect x="6" y="14" width="12" height="8" rx="1" />
                                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-2" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn"
                                    onClick={() => startInlineEdit(record)}
                                    title="Edit"
                                    aria-label="Edit"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 20h9" />
                                      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn history-action-delete"
                                    onClick={() => handleDeleteFromHistory(record.id)}
                                    title="Delete"
                                    aria-label="Delete"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M3 6h18" />
                                      <path d="M8 6V4h8v2" />
                                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                      <path d="M10 11v6M14 11v6" />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isInlineEditing && (
                          <tr className="history-detail-row history-inline-items-row">
                            <td colSpan={10}>
                              <div className="history-inline-items-editor">
                                <div className="history-inline-items-list">
                                  {inlineItems.map((item, index) => (
                                    <div className="history-inline-item-row" key={item.id}>
                                      <span className="history-inline-item-index">{index + 1}</span>
                                      <input
                                        className="history-inline-input history-inline-item-name"
                                        type="text"
                                        lang="ur"
                                        dir="rtl"
                                        value={item.item}
                                        placeholder="آئٹم کا نام"
                                        onChange={(event) =>
                                          handleInlineHistoryItemChange(item.id, "item", event.target.value)
                                        }
                                      />
                                      <input
                                        className="history-inline-input history-inline-item-amount"
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={item.amount}
                                        placeholder="0"
                                        onChange={(event) =>
                                          handleInlineHistoryItemChange(item.id, "amount", event.target.value)
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={() => removeInlineHistoryItem(item.id)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <div className="history-inline-items-tools">
                                  <button type="button" className="btn btn-secondary" onClick={addInlineHistoryItem}>
                                    + آئٹم شامل کریں
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : activePage === "expenditure" ? (
        <section className="card expenditure-card" dir="ltr">
          <section className="expenditure-top-section">
            <div className="expenditure-head">
              <div className="expenditure-head-main">
                <h2>Expenditure Records</h2>
                <span className="history-count">Total records: {expenditureHistory.length}</span>
              </div>
              <div className="expenditure-total">
                <span>Total spend</span>
                <strong>{totalExpenditure}</strong>
              </div>
            </div>
            <form className="expenditure-form" onSubmit={handleExpenditureSubmit}>
              <input
                className="mini-filter"
                type="date"
                value={expenditureDate}
                onChange={(event) => setExpenditureDate(event.target.value)}
                required
              />
              <input
                className="mini-filter"
                type="text"
                placeholder="Expenditure title"
                value={expenditureTitle}
                onChange={(event) => setExpenditureTitle(event.target.value)}
                required
              />
              <input
                className="mini-filter"
                type="number"
                min="1"
                step="1"
                placeholder="Amount"
                value={expenditureAmount}
                onChange={(event) => setExpenditureAmount(sanitizeWholeInput(event.target.value))}
                required
              />
              <input
                className="mini-filter"
                type="text"
                placeholder="Notes (optional)"
                value={expenditureNotes}
                onChange={(event) => setExpenditureNotes(event.target.value)}
              />
              <button type="submit" className="btn btn-primary expenditure-save-btn" disabled={isSavingExpenditure}>
                {isSavingExpenditure ? "Saving..." : "Save"}
              </button>
            </form>
          </section>

          <section className="expenditure-history-section">
            <div className="expenditure-history-head">
              <div className="expenditure-history-title">
                <h3>History</h3>
                <span className="history-count">
                  Showing: {filteredExpenditureHistory.length} / {expenditureHistory.length}
                </span>
              </div>
              <div className="expenditure-total">
                <span>Total spend (filtered)</span>
                <strong>{filteredExpenditureTotal}</strong>
              </div>
            </div>

            <div className="expenditure-filters">
              <input
                className="mini-filter"
                type="text"
                placeholder="Search title / notes"
                value={expenditureSearch}
                onChange={(event) => setExpenditureSearch(event.target.value)}
              />
              <input
                className="mini-filter"
                type="date"
                title="From date"
                value={expenditureDateFrom}
                onChange={(event) => setExpenditureDateFrom(event.target.value)}
              />
              <input
                className="mini-filter"
                type="date"
                title="To date"
                value={expenditureDateTo}
                onChange={(event) => setExpenditureDateTo(event.target.value)}
              />
              <button type="button" className="btn btn-secondary expenditure-export-btn" onClick={handleExportExpenditurePdf}>
                Export PDF
              </button>
            </div>

            {isLoadingExpenditures ? (
              <div className="history-empty expenditure-empty">Loading expenditure records...</div>
            ) : expenditureHistory.length === 0 ? (
              <div className="history-empty expenditure-empty">No expenditure records yet.</div>
            ) : filteredExpenditureHistory.length === 0 ? (
              <div className="history-empty expenditure-empty">No records found for current filters.</div>
            ) : (
              <div className="history-table-wrap expenditure-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Title</th>
                      <th>Amount</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenditureHistory.map((record) => (
                      <tr key={record.id}>
                        <td>
                          {editingExpenditureId === record.id ? (
                            <input
                              className="history-inline-input"
                              type="date"
                              value={editingExpenditureDraft?.date || getTodayDate()}
                              onChange={(event) =>
                                setEditingExpenditureDraft((current) => ({
                                  ...(current || {}),
                                  date: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            <bdi dir="ltr">{formatDateDDMMYYYY(record.date)}</bdi>
                          )}
                        </td>
                        <td>
                          {editingExpenditureId === record.id ? (
                            <input
                              className="history-inline-input"
                              type="text"
                              value={editingExpenditureDraft?.title || ""}
                              onChange={(event) =>
                                setEditingExpenditureDraft((current) => ({
                                  ...(current || {}),
                                  title: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            record.title
                          )}
                        </td>
                        <td>
                          {editingExpenditureId === record.id ? (
                            <input
                              className="history-inline-input"
                              type="number"
                              min="1"
                              step="1"
                              value={editingExpenditureDraft?.amount || ""}
                              onChange={(event) =>
                                setEditingExpenditureDraft((current) => ({
                                  ...(current || {}),
                                  amount: sanitizeWholeInput(event.target.value),
                                }))
                              }
                            />
                          ) : (
                            record.amount
                          )}
                        </td>
                        <td>
                          {editingExpenditureId === record.id ? (
                            <input
                              className="history-inline-input"
                              type="text"
                              value={editingExpenditureDraft?.notes || ""}
                              onChange={(event) =>
                                setEditingExpenditureDraft((current) => ({
                                  ...(current || {}),
                                  notes: event.target.value,
                                }))
                              }
                            />
                          ) : (
                            record.notes || "-"
                          )}
                        </td>
                        <td className="history-actions-cell">
                          <div className="history-actions-wrap">
                            <div className="history-row-actions">
                              {editingExpenditureId === record.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-primary history-action-icon-btn"
                                    onClick={saveExpenditureEdit}
                                    title="Save"
                                    aria-label="Save"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn"
                                    onClick={cancelExpenditureEdit}
                                    title="Cancel"
                                    aria-label="Cancel"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn"
                                    onClick={() => startExpenditureEdit(record)}
                                    title="Edit"
                                    aria-label="Edit"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M12 20h9" />
                                      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost history-action-icon-btn history-action-delete"
                                    onClick={() => handleDeleteExpenditure(record.id)}
                                    title="Delete"
                                    aria-label="Delete"
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M3 6h18" />
                                      <path d="M8 6V4h8v2" />
                                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                      <path d="M10 11v6M14 11v6" />
                                    </svg>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className="card">
          <form className="payment-form" onSubmit={handleSubmit}>
                <header className="form-header">
                  <div className="form-title-row">
                    <h1>{editingPaymentId ? "طلبہ فیس ادائیگی (ترمیم)" : "طلبہ فیس ادائیگی"}</h1>
                    <div className="form-title-tools">
                      <span className="invoice-chip">Invoice: {invoiceNo}</span>
                      <label className="print-prompt-toggle" title="Enable/disable print prompt after save">
                        <input
                          type="checkbox"
                          checked={isPrintPromptEnabled}
                          onChange={(e) => {
                            setIsPrintPromptEnabled(e.target.checked);
                            if (!e.target.checked) {
                              setPrintConfirmRecord(null);
                            }
                          }}
                        />
                        <span>Print Prompt</span>
                      </label>
                    </div>
                  </div>
              <div className="grid grid-4">
                <label className="field">
                  <span>طالب علم کا نام</span>
                  <input
                    ref={studentNameRef}
                    type="text"
                    lang="ur"
                    dir="rtl"
                    placeholder="طالب علم کا نام درج کریں"
                    value={studentName}
                    onChange={(e) => setUrduOnlyValue(setStudentName, e.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span>والد کا نام</span>
                  <input
                    type="text"
                    lang="ur"
                    dir="rtl"
                    placeholder="والد کا نام درج کریں"
                    value={fatherName}
                    onChange={(e) => setUrduOnlyValue(setFatherName, e.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span>کلاس</span>
                  <input
                    type="text"
                    placeholder="مثلاً: جماعت 7"
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" && !e.shiftKey) {
                        e.preventDefault();
                        firstItemNameRef.current?.focus();
                      }
                    }}
                    required
                  />
                </label>

                <label className="field">
                  <span>تاریخ</span>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </label>
              </div>
            </header>

            <main className="form-main">
              <section className="fee-section" aria-labelledby="feeItemsHeading">
                <div className="section-title-row">
                  <h2 id="feeItemsHeading">فیس آئٹمز</h2>
                  <button type="button" className="btn btn-secondary" onClick={addFeeItem}>
                    + آئٹم شامل کریں
                  </button>
                </div>

                <div className="fee-items-scroll">
                  <div className="fee-items" role="group" aria-label="فیس آئٹمز کی فہرست">
                    {feeItems.map((fee, index) => (
                      <div className="fee-item" key={fee.id}>
                        <label className="field">
                          <span>آئٹم کا نام</span>
                          <input
                            ref={index === 0 ? firstItemNameRef : null}
                            type="text"
                            lang="ur"
                            dir="rtl"
                            value={fee.item}
                            onChange={(e) => updateFeeItem(fee.id, "item", e.target.value)}
                            placeholder="مثلاً: ماہانہ فیس"
                          />
                        </label>

                        <label className="field">
                          <span>رقم</span>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={fee.amount}
                            onChange={(e) => updateFeeItem(fee.id, "amount", e.target.value)}
                            placeholder="0"
                          />
                        </label>

                        <div className="item-actions">
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => removeFeeItem(fee.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </main>

            <footer className="form-footer">
              <section className="totals grid grid-3">
                <label className="field">
                  <span>کل رقم</span>
                  <input type="number" value={totalAmount} readOnly tabIndex={-1} />
                </label>

                <label className="field">
                  <span>وصول شدہ رقم</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(sanitizeWholeInput(e.target.value))}
                  />
                </label>

                <label className="field">
                  <span>بقایا رقم</span>
                  <input type="number" value={remainingAmount} readOnly tabIndex={-1} />
                </label>
              </section>

                  <div className="actions">
                    <button type="submit" className="btn btn-primary" disabled={isSavingPayment}>
                      {isSavingPayment ? "Saving..." : editingPaymentId ? "Update" : "Save"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={handleReset}>
                      Reset
                </button>
              </div>
            </footer>
          </form>
        </section>
      )}

      {(activePage === "collect-fee" || activePage === "expenditure") && (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((item) => (
            <div
              className={`toast toast-${item.type} ${item.isClosing ? "is-closing" : ""}`}
              style={{ "--toast-duration": `${item.duration || 3200}ms` }}
              key={item.id}
            >
              <span className="toast-message" dir={getMessageDirection(item.message)}>
                {item.message}
              </span>
              <button
                type="button"
                className="toast-close"
                onClick={() => toast.dismiss(item.id)}
                aria-label="پیغام بند کریں"
              >
                ×
              </button>
              <div className="toast-progress" aria-hidden="true" />
            </div>
          ))}
        </div>
      )}

      {printConfirmRecord && (
        <div className="modal-overlay" role="presentation">
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-confirm-title"
            aria-describedby="print-confirm-message"
            onKeyDown={handlePrintConfirmKeyDown}
          >
            <h3 id="print-confirm-title">رسید پرنٹ کریں؟</h3>
            <p id="print-confirm-message">ادائیگی محفوظ ہوگئی۔ کیا آپ رسید پرنٹ کرنا چاہتے ہیں؟</p>
            <div className="confirm-modal-actions">
              <button
                ref={printConfirmButtonRef}
                type="button"
                className="btn btn-primary"
                onClick={confirmPrintAfterSave}
              >
                Print
              </button>
              <button type="button" className="btn btn-ghost" onClick={skipPrintAfterSave}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
