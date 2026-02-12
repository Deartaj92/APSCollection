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
export default function App() {
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
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyClassFilter, setHistoryClassFilter] = useState("");
  const [historyDateFrom, setHistoryDateFrom] = useState(getFirstDateOfCurrentMonth);
  const [historyDateTo, setHistoryDateTo] = useState(getTodayDate);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [printConfirmRecord, setPrintConfirmRecord] = useState(null);

  const studentNameRef = useRef(null);
  const firstItemNameRef = useRef(null);
  const printConfirmButtonRef = useRef(null);
  const { toasts, toast } = useToast();

  useEffect(() => {
    localStorage.setItem("theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

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
    if (!supabase) {
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
  }, [toast]);

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

    return paymentHistory.filter((record) => {
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
    });
  }, [paymentHistory, historySearch, historyClassFilter, historyDateFrom, historyDateTo]);

  const dashboardData = useMemo(() => {
    const totals = paymentHistory.reduce(
      (acc, record) => {
        acc.billed += record.totalAmount;
        acc.collected += record.amountReceived;
        acc.outstanding += record.remainingAmount;
        return acc;
      },
      { billed: 0, collected: 0, outstanding: 0 }
    );

    const invoiceCount = paymentHistory.length;

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const monthPrefix = `${year}-${month}`;

    const currentMonthRecords = paymentHistory.filter((record) =>
      String(record.date || "").startsWith(monthPrefix)
    );
    const monthCollected = currentMonthRecords.reduce((sum, record) => sum + record.amountReceived, 0);

    const todayDate = getTodayDate();
    const todayCollected = paymentHistory
      .filter((record) => record.date === todayDate)
      .reduce((sum, record) => sum + record.amountReceived, 0);

    const monthlyMap = paymentHistory.reduce((map, record) => {
      const key = String(record.date || "").slice(0, 7);
      if (!key) {
        return map;
      }
      if (!map[key]) {
        map[key] = { key, collected: 0, invoices: 0 };
      }
      map[key].collected += record.amountReceived;
      map[key].invoices += 1;
      return map;
    }, {});

    const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
    const monthlyCollectionSeries = Object.values(monthlyMap)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-6)
      .map((row) => {
        const [rowYear, rowMonth] = row.key.split("-").map(Number);
        const labelDate = new Date(rowYear, (rowMonth || 1) - 1, 1);
        return {
          label: monthFormatter.format(labelDate),
          invoices: row.invoices,
          collected: row.collected,
        };
      });

    const dailyMap = paymentHistory.reduce((map, record) => {
      const key = String(record.date || "");
      if (!key) {
        return map;
      }
      if (!map[key]) {
        map[key] = { key, collected: 0, invoices: 0 };
      }
      map[key].collected += record.amountReceived;
      map[key].invoices += 1;
      return map;
    }, {});

    const dailyCollectionSeries = Object.values(dailyMap)
      .sort((a, b) => a.key.localeCompare(b.key))
      .slice(-7)
      .map((row) => ({
        label: formatDateDDMMYYYY(row.key),
        invoices: row.invoices,
        collected: row.collected,
      }));

    const outstandingRecords = paymentHistory
      .filter((record) => record.remainingAmount > 0)
      .sort((a, b) => b.remainingAmount - a.remainingAmount)
      .slice(0, 5);

    return {
      invoiceCount,
      totals,
      monthCollected,
      todayCollected,
      monthlyCollectionSeries,
      dailyCollectionSeries,
      outstandingRecords,
    };
  }, [paymentHistory]);

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

  const handleReset = () => {
    setDate(getTodayDate());
    setStudentName("");
    setFatherName("");
    setStudentClass("");
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
      id: crypto.randomUUID(),
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
    let updatedHistory = [record, ...paymentHistory];

    if (supabase) {
      const { data: paymentRow, error: paymentError } = await supabase
        .from("fee_payments")
        .insert({
          invoice_no: record.invoiceNo,
          payment_date: record.date,
          student_name: record.studentName,
          father_name: record.fatherName,
          class_name: record.className,
          total_amount: record.totalAmount,
          amount_received: record.amountReceived,
        })
        .select(
          "id,invoice_no,payment_date,student_name,father_name,class_name,total_amount,amount_received,remaining_amount,created_at"
        )
        .single();

      if (paymentError) {
        setIsSavingPayment(false);
        toast.error("ادائیگی محفوظ نہیں ہو سکی۔");
        return;
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
          await supabase.from("fee_payments").delete().eq("id", paymentRow.id);
          setIsSavingPayment(false);
          toast.error("آئٹمز محفوظ نہیں ہو سکے۔");
          return;
        }
      }

      updatedHistory = [
        mapDbPaymentToUiRecord({
          ...paymentRow,
          fee_payment_items: record.feeItems.map((item, index) => ({
            item_name: item.item,
            amount: item.amount,
            sort_order: index,
          })),
        }),
        ...paymentHistory,
      ];
    }

    const savedRecord = supabase ? updatedHistory[0] : record;

    setPaymentHistory(updatedHistory);
    setIsSavingPayment(false);

    toast.success("ادائیگی کامیابی سے محفوظ ہو گئی۔");
    setPrintConfirmRecord(savedRecord);
    handleReset();
    setInvoiceNo(getNextInvoiceNumber(updatedHistory));
    window.setTimeout(() => {
      studentNameRef.current?.focus();
    }, 0);
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

  return (
    <main className={`app-shell ${isDarkMode ? "theme-dark" : ""}`}>
      <header className="app-header">
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setIsDarkMode((prev) => !prev)}
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? "Light Mode" : "Dark Mode"}
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
        </nav>
      </header>

      {activePage === "home" ? (
        <section className="card dashboard-card">
          <div className="history-head">
            <div className="history-head-info">
              <h2>Dashboard</h2>
              <span className="history-count">
                Total invoices: {dashboardData.invoiceCount}
              </span>
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="history-empty">Loading dashboard data...</div>
          ) : (
            <div className="dashboard-layout">
              <div className="dashboard-kpis">
                <article className="kpi-card">
                  <span>Total Collected</span>
                  <strong>{dashboardData.totals.collected}</strong>
                </article>
                <article className="kpi-card">
                  <span>Total Invoices</span>
                  <strong>{dashboardData.invoiceCount}</strong>
                </article>
                <article className="kpi-card">
                  <span>Collection This Month</span>
                  <strong>{dashboardData.monthCollected}</strong>
                </article>
                <article className="kpi-card">
                  <span>Collection Today</span>
                  <strong>{dashboardData.todayCollected}</strong>
                </article>
              </div>

              <div className="dashboard-panels">
                <section className="dashboard-panel">
                  <div className="panel-head">
                    <h3>Monthly Collection Data</h3>
                    <span>Last 6 months</span>
                  </div>
                  {dashboardData.monthlyCollectionSeries.length === 0 ? (
                    <div className="history-empty">No records available.</div>
                  ) : (
                    <div className="dashboard-mini-table-wrap">
                      <table className="history-table dashboard-mini-table">
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Invoices</th>
                            <th>Collected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.monthlyCollectionSeries.map((row) => (
                            <tr key={row.label}>
                              <td>{row.label}</td>
                              <td>{row.invoices}</td>
                              <td>{row.collected}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="dashboard-panel">
                  <div className="panel-head">
                    <h3>Daily Collection Data</h3>
                    <span>Last 7 days</span>
                  </div>
                  {dashboardData.dailyCollectionSeries.length === 0 ? (
                    <div className="history-empty">No records available.</div>
                  ) : (
                    <div className="dashboard-mini-table-wrap">
                      <table className="history-table dashboard-mini-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Invoices</th>
                            <th>Collected</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.dailyCollectionSeries.map((row) => (
                            <tr key={row.label}>
                              <td>{row.label}</td>
                              <td>{row.invoices}</td>
                              <td>{row.collected}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>

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
                        <span>{record.invoiceNo}</span>
                        <span>{record.studentName || "-"}</span>
                        <span>{record.remainingAmount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
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
                    <th>پرنٹ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPaymentHistory.map((record) => {
                    const itemCount = record.feeItems.length;
                    const isExpanded = expandedHistoryId === record.id;

                    return (
                      <Fragment key={record.id}>
                        <tr>
                          <td>{record.invoiceNo || "-"}</td>
                          <td>
                            <bdi dir="ltr">{formatDateDDMMYYYY(record.date)}</bdi>
                          </td>
                          <td>{record.studentName || "-"}</td>
                          <td>{record.fatherName || "-"}</td>
                          <td>{record.className || "-"}</td>
                          <td className="history-items-cell">
                            <button
                              type="button"
                              className="history-items-toggle"
                              onClick={() =>
                                setExpandedHistoryId((current) =>
                                  current === record.id ? null : record.id
                                )
                              }
                            >
                              <span>{isExpanded ? "▾" : "▸"}</span>
                              <span>{itemCount ? `${itemCount} آئٹمز` : "کوئی آئٹم نہیں"}</span>
                            </button>
                          </td>
                          <td>{record.totalAmount}</td>
                          <td>{record.amountReceived}</td>
                          <td>{record.remainingAmount}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost history-print-btn"
                              onClick={() => handlePrintInvoice(record)}
                              title="Print invoice"
                              aria-label="Print invoice"
                            >
                              <span aria-hidden="true">🖨</span>
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="history-detail-row">
                            <td colSpan={10}>
                              {itemCount ? (
                                <div className="history-item-chips">
                                  {record.feeItems.map((item, index) => (
                                    <span
                                      key={`${record.id}-${item.item || "item"}-${index}`}
                                      className="history-item-chip"
                                    >
                                      {item.item || "Unnamed"} {item.amount}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="history-detail-empty">کوئی آئٹم دستیاب نہیں۔</div>
                              )}
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
      ) : (
        <section className="card">
          <form className="payment-form" onSubmit={handleSubmit}>
            <header className="form-header">
              <div className="form-title-row">
                <h1>طلبہ فیس ادائیگی</h1>
                <span className="invoice-chip">Invoice: {invoiceNo}</span>
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
                  {isSavingPayment ? "Saving..." : "Save"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={handleReset}>
                  Reset
                </button>
              </div>
            </footer>
          </form>
        </section>
      )}

      {activePage === "collect-fee" && (
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((item) => (
            <div
              className={`toast toast-${item.type} ${item.isClosing ? "is-closing" : ""}`}
              style={{ "--toast-duration": `${item.duration || 3200}ms` }}
              key={item.id}
            >
              <span>{item.message}</span>
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
