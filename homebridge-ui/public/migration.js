/**
 * Migration helper for Homebridge Config UI
 * This script provides a button to migrate legacy input1-input16 format
 * to the new inputs array format directly in the form.
 */

window.migrateInputs = function(switchIndex) {
  console.log('[Migration] Starting migration for switch index:', switchIndex);

  // Try to find the form element
  const form = document.querySelector('form');
  if (!form) {
    alert('Could not find configuration form');
    return;
  }

  // Collect legacy inputs
  const legacyInputs = [];
  for (let i = 1; i <= 16; i++) {
    const labelSelector = `[ng-reflect-name="switches.${switchIndex}.input${i}.label"]`;
    const enabledSelector = `[ng-reflect-name="switches.${switchIndex}.input${i}.enabled"]`;

    const labelInput = document.querySelector(labelSelector);
    const enabledInput = document.querySelector(enabledSelector);

    console.log(`[Migration] Input${i} - Label element:`, labelInput, 'Value:', labelInput?.value);
    console.log(`[Migration] Input${i} - Enabled element:`, enabledInput, 'Checked:', enabledInput?.checked);

    if (labelInput && labelInput.value && labelInput.value.trim() !== '' && labelInput.value !== `Input ${i}`) {
      legacyInputs.push({
        physicalInput: i,
        label: labelInput.value,
        enabled: enabledInput ? enabledInput.checked : true
      });
    }
  }

  console.log('[Migration] Found legacy inputs:', legacyInputs);

  if (legacyInputs.length === 0) {
    alert('No configured legacy inputs found to migrate.');
    return;
  }

  // Find the "Add Input" button for the inputs array
  const addButtonSelector = `button[ng-reflect-ng-class="[object Object]"]`;
  const allButtons = Array.from(document.querySelectorAll(addButtonSelector));

  // Filter to find the button that's part of the inputs array section
  let addButton = null;
  for (const btn of allButtons) {
    const buttonText = btn.textContent || btn.innerText;
    if (buttonText.includes('Add Input')) {
      addButton = btn;
      break;
    }
  }

  if (!addButton) {
    alert('Could not find "Add Input" button. Please make sure the Inputs section is expanded.');
    return;
  }

  console.log('[Migration] Found Add Input button:', addButton);

  // Clear existing inputs array first
  const message = `Found ${legacyInputs.length} legacy inputs to migrate.\n\n` +
    legacyInputs.map(inp => `Input ${inp.physicalInput}: ${inp.label}`).join('\n') +
    '\n\nThis will add these inputs to the new array format.\nContinue?';

  if (!confirm(message)) {
    return;
  }

  // Add each legacy input to the new array
  legacyInputs.forEach((input, index) => {
    console.log(`[Migration] Adding input ${index + 1}/${legacyInputs.length}:`, input);

    // Click "Add Input" button
    addButton.click();

    // Wait a moment for the DOM to update, then fill in the fields
    setTimeout(() => {
      // Find the newly added input fields
      const allPhysicalInputs = document.querySelectorAll('[ng-reflect-name^="switches."][ng-reflect-name$=".physicalInput"]');
      const allLabels = document.querySelectorAll('[ng-reflect-name^="switches."][ng-reflect-name$=".label"]');
      const allEnabled = document.querySelectorAll('[ng-reflect-name^="switches."][ng-reflect-name$=".enabled"]');

      // Get the last one (newly added)
      const physicalInputField = allPhysicalInputs[allPhysicalInputs.length - 1];
      const labelField = allLabels[allLabels.length - 1];
      const enabledField = allEnabled[allEnabled.length - 1];

      if (physicalInputField) {
        physicalInputField.value = input.physicalInput;
        physicalInputField.dispatchEvent(new Event('input', { bubbles: true }));
        physicalInputField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (labelField) {
        labelField.value = input.label;
        labelField.dispatchEvent(new Event('input', { bubbles: true }));
        labelField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      if (enabledField) {
        enabledField.checked = input.enabled;
        enabledField.dispatchEvent(new Event('input', { bubbles: true }));
        enabledField.dispatchEvent(new Event('change', { bubbles: true }));
      }

      console.log('[Migration] Filled fields for input:', input);

      // If this is the last one, show completion message
      if (index === legacyInputs.length - 1) {
        setTimeout(() => {
          alert(`Successfully added ${legacyInputs.length} inputs to the new format!\n\nPlease review the inputs and click Save to persist the changes.`);
        }, 500);
      }
    }, 300 * (index + 1)); // Stagger the additions
  });
};
