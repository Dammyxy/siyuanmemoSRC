# Manual Testing Guide: Custom Day Start Feature

## Overview

This guide will help you manually test the "Custom Day Start" feature to ensure all components are working correctly in a real environment.

## Prerequisites

- Plugin is built and loaded in SiYuan
- You have some flashcards in your system
- You can access the plugin settings panel

## Test Scenarios

### Scenario 1: Settings Panel UI

**Objective:** Verify the settings panel displays and saves dayStartHour correctly

**Steps:**
1. Open the FSRS plugin settings panel
2. Navigate to the "参数设置" (Parameters) tab
3. Scroll down to find "每日刷新时间" (Daily Refresh Time) section

**Expected Results:**
- ✅ You should see an input field with a number (default: 4)
- ✅ You should see "点" (o'clock) unit label next to the input
- ✅ You should see a description explaining the feature
- ✅ You should see "当前'今天'范围：" showing the current time range
- ✅ You should see three quick-set buttons: "午夜 (0点)", "凌晨 (4点)", "早晨 (6点)"

**Test Actions:**
1. Click "午夜 (0点)" button
   - ✅ Input should change to 0
   - ✅ Time range should update to show 00:00:00 ~ 00:00:00 (next day)
   
2. Click "凌晨 (4点)" button
   - ✅ Input should change to 4
   - ✅ Time range should update to show 04:00:00 ~ 04:00:00 (next day)
   
3. Click "早晨 (6点)" button
   - ✅ Input should change to 6
   - ✅ Time range should update to show 06:00:00 ~ 06:00:00 (next day)
   
4. Manually type "8" in the input field
   - ✅ Time range should update to show 08:00:00 ~ 08:00:00 (next day)
   
5. Try typing invalid values:
   - Type "-1" → Should be rejected or reset to 0
   - Type "24" → Should be rejected or reset to 23
   - Type "1.5" → Should be rejected or reset to nearest integer
   
6. Click "保存设置" (Save Settings)
   - ✅ Settings should be saved
   - ✅ You should see a success message (if implemented)
   
7. Close and reopen the settings panel
   - ✅ dayStartHour should still be 8 (or whatever you saved)

---

### Scenario 2: Browser Service - Due Cards Filter

**Objective:** Verify the browser's "due" preset uses dayStartHour correctly

**Setup:**
1. Set dayStartHour to 4 in settings
2. Note the current time (e.g., 10:00 AM)
3. Create or identify test cards with different due times:
   - Card A: due yesterday
   - Card B: due today at 3:00 AM (before dayStartHour)
   - Card C: due today at 10:00 AM (after dayStartHour)
   - Card D: due tomorrow at 3:00 AM (before tomorrow's dayStartHour)
   - Card E: due tomorrow at 5:00 AM (after tomorrow's dayStartHour)

**Steps:**
1. Open SRS Browser
2. Apply "due" preset filter

**Expected Results:**
- ✅ Card A should be visible (due yesterday)
- ✅ Card B should be visible (due today before dayStartHour)
- ✅ Card C should be visible (due today after dayStartHour)
- ✅ Card D should be visible (due tomorrow before dayStartHour)
- ❌ Card E should NOT be visible (due tomorrow after dayStartHour)

**Test with Different dayStartHour:**
1. Change dayStartHour to 0 (midnight)
2. Refresh browser
3. Apply "due" preset filter

**Expected Results:**
- ✅ Card A should be visible
- ✅ Card B should be visible
- ✅ Card C should be visible
- ❌ Card D should NOT be visible (tomorrow)
- ❌ Card E should NOT be visible (tomorrow)

---

### Scenario 3: Review Queue - Due Cards

**Objective:** Verify review queues only show due cards based on dayStartHour

**Setup:**
1. Set dayStartHour to 4
2. Ensure you have cards with various due times (as in Scenario 2)

**Steps:**
1. Open Incremental Learning Queue (渐进学习队列)
2. Check which cards are shown

**Expected Results:**
- ✅ Only cards with due <= (tomorrow 4:00 AM) should be shown
- ✅ Cards due after tomorrow 4:00 AM should NOT be shown

**Test Actions:**
1. Change dayStartHour to 6
2. Refresh the queue
3. Check which cards are shown

**Expected Results:**
- ✅ The list should update to reflect the new dayEnd
- ✅ Some cards may disappear (if they were due between 4 AM and 6 AM tomorrow)
- ✅ Some cards may appear (if they were due between yesterday 6 AM and today 4 AM)

---

### Scenario 4: Late Night Usage (3 AM Test)

**Objective:** Verify the feature works correctly when used late at night

**Note:** This test is best performed at 3:00 AM, but you can simulate it by temporarily modifying system time (not recommended for production testing).

**Setup:**
1. Set dayStartHour to 4
2. Current time: 3:00 AM (January 15)

**Expected Behavior:**
- "Today" should be: January 14, 4:00 AM ~ January 15, 4:00 AM
- Cards due before January 15, 4:00 AM should be considered "due"
- Cards due after January 15, 4:00 AM should NOT be considered "due"

**Verification:**
1. Check settings panel "当前'今天'范围"
   - ✅ Should show: 2024-01-14 04:00:00 ~ 2024-01-15 04:00:00
   
2. Check browser "due" filter
   - ✅ Should show cards due before 4:00 AM today
   - ❌ Should NOT show cards due after 4:00 AM today

---

### Scenario 5: Early Morning Usage (5 AM Test)

**Objective:** Verify the feature works correctly in early morning

**Setup:**
1. Set dayStartHour to 4
2. Current time: 5:00 AM (January 15)

**Expected Behavior:**
- "Today" should be: January 15, 4:00 AM ~ January 16, 4:00 AM
- Cards due before January 16, 4:00 AM should be considered "due"
- Cards due after January 16, 4:00 AM should NOT be considered "due"

**Verification:**
1. Check settings panel "当前'今天'范围"
   - ✅ Should show: 2024-01-15 04:00:00 ~ 2024-01-16 04:00:00
   
2. Check browser "due" filter
   - ✅ Should show cards due before 4:00 AM tomorrow
   - ❌ Should NOT show cards due after 4:00 AM tomorrow

---

### Scenario 6: Configuration Persistence

**Objective:** Verify dayStartHour persists across plugin restarts

**Steps:**
1. Set dayStartHour to 8
2. Save settings
3. Close SiYuan completely
4. Reopen SiYuan
5. Open plugin settings

**Expected Results:**
- ✅ dayStartHour should still be 8
- ✅ "当前'今天'范围" should reflect dayStartHour=8

---

### Scenario 7: Backward Compatibility

**Objective:** Verify existing users see default behavior

**Setup:**
1. Simulate a fresh install or user without dayStartHour configured
2. Open plugin settings

**Expected Results:**
- ✅ dayStartHour should default to 4
- ✅ Existing review data should still work correctly
- ✅ No errors in console

---

### Scenario 8: Error Handling

**Objective:** Verify the system handles errors gracefully

**Test Actions:**
1. Try to save invalid dayStartHour values through settings UI
   - Try: -1, 24, 25, 100, -100, 1.5, "abc"
   - ✅ All should be rejected or corrected
   
2. Check browser console for errors
   - ✅ Should see warning logs for invalid values
   - ✅ Should see fallback to default value 4
   - ❌ Should NOT see any uncaught exceptions

---

## Checklist Summary

Use this checklist to track your manual testing progress:

### Settings Panel
- [ ] dayStartHour field is visible and editable
- [ ] "当前'今天'范围" displays and updates correctly
- [ ] Quick-set buttons work (0, 4, 6)
- [ ] Invalid values are rejected
- [ ] Settings persist after save and reload

### Browser Service
- [ ] "due" preset filter uses dayStartHour
- [ ] Changing dayStartHour updates filter results
- [ ] Cards are filtered correctly based on dayEnd

### Review Queue
- [ ] Incremental Learning Queue shows only due cards
- [ ] Retrieval Practice Queue shows only due cards
- [ ] Changing dayStartHour updates queue contents

### Edge Cases
- [ ] Works correctly at 3 AM (before dayStartHour=4)
- [ ] Works correctly at 5 AM (after dayStartHour=4)
- [ ] Works correctly with dayStartHour=0 (midnight)
- [ ] Works correctly with dayStartHour=23 (late night)

### Error Handling
- [ ] Invalid values are rejected gracefully
- [ ] No uncaught exceptions in console
- [ ] Appropriate warning logs are shown

### Backward Compatibility
- [ ] Default value (4) is used for new/existing users
- [ ] Existing review data works correctly
- [ ] No breaking changes

---

## Reporting Issues

If you find any issues during manual testing, please report them with:

1. **Scenario name** (e.g., "Scenario 2: Browser Service")
2. **Steps to reproduce**
3. **Expected result**
4. **Actual result**
5. **Screenshots** (if applicable)
6. **Console logs** (if errors occurred)
7. **dayStartHour value** used during testing
8. **Current time** when issue occurred

---

## Success Criteria

All scenarios should pass with ✅ marks. If any scenario fails, investigate and fix before proceeding to user acceptance testing.

**Integration Testing Status:** ✅ Completed (24/24 tests passed)  
**Manual Testing Status:** ⏳ Pending  
**User Acceptance Testing Status:** ⏳ Pending
