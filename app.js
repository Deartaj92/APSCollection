const feeItemsContainer = document.getElementById("feeItems");
const addItemBtn = document.getElementById("addItemBtn");
const paymentForm = document.getElementById("paymentForm");
const totalAmountInput = document.getElementById("totalAmount");
const amountReceivedInput = document.getElementById("amountReceived");
const remainingAmountInput = document.getElementById("remainingAmount");
const recordOutput = document.getElementById("recordOutput");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recalculateTotals() {
  const amounts = feeItemsContainer.querySelectorAll(".fee-item-amount");
  const total = Array.from(amounts).reduce((sum, input) => sum + toNumber(input.value), 0);
  const received = toNumber(amountReceivedInput.value);
  const remaining = Math.max(total - received, 0);

  totalAmountInput.value = total.toFixed(2);
  remainingAmountInput.value = remaining.toFixed(2);
}

function createFeeItemRow(itemName = "", amount = "") {
  const row = document.createElement("div");
  row.className = "fee-item";

  row.innerHTML = `
    <label class="field">
      <span>Item Name</span>
      <input type="text" class="fee-item-name" placeholder="e.g. Tuition Fee" value="${itemName}" required />
    </label>
    <label class="field">
      <span>Amount</span>
      <input type="number" class="fee-item-amount" min="0" step="0.01" placeholder="0.00" value="${amount}" required />
    </label>
    <div class="item-actions">
      <button type="button" class="btn btn-danger remove-item">Remove</button>
    </div>
  `;

  const amountInput = row.querySelector(".fee-item-amount");
  const removeButton = row.querySelector(".remove-item");

  amountInput.addEventListener("input", recalculateTotals);
  removeButton.addEventListener("click", () => {
    row.remove();
    if (!feeItemsContainer.children.length) {
      createFeeItemRow();
    }
    recalculateTotals();
  });

  feeItemsContainer.appendChild(row);
}

addItemBtn.addEventListener("click", () => {
  createFeeItemRow();
});

amountReceivedInput.addEventListener("input", recalculateTotals);

paymentForm.addEventListener("reset", () => {
  setTimeout(() => {
    feeItemsContainer.innerHTML = "";
    createFeeItemRow();
    amountReceivedInput.value = "0";
    recalculateTotals();
    recordOutput.textContent = "No record saved yet.";
  }, 0);
});

paymentForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!paymentForm.reportValidity()) {
    return;
  }

  const feeItems = Array.from(feeItemsContainer.querySelectorAll(".fee-item")).map((row) => ({
    item: row.querySelector(".fee-item-name").value.trim(),
    amount: toNumber(row.querySelector(".fee-item-amount").value),
  }));

  const record = {
    date: document.getElementById("paymentDate").value,
    studentName: document.getElementById("studentName").value.trim(),
    fatherName: document.getElementById("fatherName").value.trim(),
    class: document.getElementById("studentClass").value.trim(),
    feeItems,
    totalAmount: toNumber(totalAmountInput.value),
    amountReceived: toNumber(amountReceivedInput.value),
    remainingAmount: toNumber(remainingAmountInput.value),
  };

  recordOutput.textContent = JSON.stringify(record, null, 2);
});

createFeeItemRow("Tuition Fee", "0");
recalculateTotals();
