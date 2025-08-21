// --- Helpers
function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className =
    "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white shadow-lg " +
    (type === "success" ? "bg-green-600" : "bg-red-600");
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2500);
}

function setInputsDisabled(disabled) {
  const ids = ["profileName", "profilePhone", "profileLocation"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    el.disabled = disabled;
    el.classList.toggle("bg-gray-100", disabled);
  });
}

// Populate from global currentUser if includes.js provides it
function populateProfileWhenReady() {
  if (window.currentUser) {
    const user = window.currentUser;
    document.getElementById("profileName").value = user.fullName || "";
    document.getElementById("profilePhone").value = user.phoneNumber || "";
    document.getElementById("profileLocation").value = user.country || "";
    document.getElementById("profileEmail").value = user.email || "";

    document.getElementById("sidebarName").textContent =
      user.fullName || "User";
    document.getElementById("sidebarLocation").innerHTML =
      '<i class="fas fa-map-marker-alt mr-1"></i> ' +
      (user.country || "Location");
  } else {
    setTimeout(populateProfileWhenReady, 100);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  populateProfileWhenReady();

  const editSaveBtn = document.getElementById("editSaveBtn");
  const cancelBtn = document.getElementById("cancelBtn");
  const saveHint = document.getElementById("saveHint");

  // Keep a copy to restore on Cancel
  let original = { name: "", phone: "", country: "" };
  let editing = false;

  function snapshotValues() {
    original = {
      name: document.getElementById("profileName").value,
      phone: document.getElementById("profilePhone").value,
      country: document.getElementById("profileLocation").value,
    };
  }

  function restoreValues() {
    document.getElementById("profileName").value = original.name;
    document.getElementById("profilePhone").value = original.phone;
    document.getElementById("profileLocation").value = original.country;
  }

  function setEditingState(on) {
    editing = on;
    setInputsDisabled(!on);
    cancelBtn.classList.toggle("hidden", !on);
    saveHint.classList.toggle("hidden", !on);

    const icon = editSaveBtn.querySelector("i");
    const label = editSaveBtn.querySelector("span");
    if (on) {
      icon.className = "fas fa-save mr-2";
      label.textContent = "Save changes";
      editSaveBtn.classList.remove("bg-yellow-400", "hover:bg-yellow-500");
      editSaveBtn.classList.add("bg-green-600", "hover:bg-green-700");
    } else {
      icon.className = "fas fa-pen mr-2";
      label.textContent = "Edit";
      editSaveBtn.classList.add("bg-yellow-400", "hover:bg-yellow-500");
      editSaveBtn.classList.remove("bg-green-600", "hover:bg-green-700");
    }
  }

  async function callUpdateEndpoint(fullName, phoneNumber, country) {
    const token = localStorage.getItem("accessToken");
    const params = new URLSearchParams({
      FullName: fullName,
      PhoneNumber: phoneNumber,
      Country: country,
    });

    return fetch("/api/Auth/Update?" + params.toString(), {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
  }

  function validateInputs({ name, phone, country }) {
    if (!name.trim() || !country.trim() || !phone.trim()) {
      return "Name, Phone, and Country are required.";
    }

    return null;
  }

  async function handleSave() {
    const name = document.getElementById("profileName").value.trim();
    const phone = document.getElementById("profilePhone").value.trim();
    const country = document.getElementById("profileLocation").value.trim();

    const err = validateInputs({ name, phone, country });
    if (err) {
      showToast(err, "error");
      return;
    }

    editSaveBtn.disabled = true;
    const icon = editSaveBtn.querySelector("i");
    const label = editSaveBtn.querySelector("span");
    icon.className = "fas fa-circle-notch fa-spin mr-2";
    label.textContent = "Saving…";

    try {
      const res = await callUpdateEndpoint(name, phone, country);
      if (!res.ok) {
        let errorMsg = res.statusText;
        try {
          const payload = await res.json();
          if (payload?.errors) {
            errorMsg = Array.isArray(payload.errors)
              ? payload.errors.join(", ")
              : String(payload.errors);
          } else if (payload?.message) {
            errorMsg = payload.message;
          }
        } catch (_) {}
        throw new Error(errorMsg || "Update failed");
      }

      document.getElementById("sidebarName").textContent = name;
      document.getElementById("sidebarLocation").innerHTML =
        '<i class="fas fa-map-marker-alt mr-1"></i> ' + country;

      if (window.currentUser) {
        window.currentUser.fullName = name;
        window.currentUser.phoneNumber = phone;
        window.currentUser.country = country;
      }

      snapshotValues();
      setEditingState(false);
      showToast("Profile updated successfully.");
    } catch (ex) {
      console.error(ex);
      showToast(ex.message || "Could not update profile.", "error");
    } finally {
      editSaveBtn.disabled = false;
      if (editing) {
        icon.className = "fas fa-save mr-2";
        label.textContent = "Save changes";
      } else {
        icon.className = "fas fa-pen mr-2";
        label.textContent = "Edit";
      }
    }
  }

  // Button actions
  editSaveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!editing) {
      snapshotValues();
      setEditingState(true);
      document.getElementById("profileName").focus();
    } else {
      await handleSave();
    }
  });

  cancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    restoreValues();
    setEditingState(false);
  });
});
