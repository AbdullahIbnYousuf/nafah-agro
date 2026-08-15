# Nafah Agro Bengali Wording Preferences

This guide defines the preferred Bengali voice for Nafah Agro. Read it before writing or revising any user-visible text.

## Audience and tone

- Write for a normal Bangladeshi customer or small-business owner, not for a developer or accountant.
- Use natural mixed Bengali. Familiar English-derived words are often clearer than formal Bengali.
- Prefer short, direct sentences that explain what will happen.
- Preserve the full business meaning. Do not make a sentence simpler if it becomes less accurate.
- Do not use an em dash in frontend text.

## Familiar words to keep

These words are clear and should normally remain:

- অর্ডার
- ইনভেন্টরি
- ইউনিট
- স্টক
- স্টক ব্যাচ
- সমন্বয়
- প্যাক/সাইজ
- ক্যাটাগরি
- ডেলিভারি
- ডিসকাউন্ট
- সাবটোটাল
- মার্জিন
- রিফ্রেশ
- লগইন
- প্রোফাইল
- কার্ট
- ডিফল্ট
- ফিচার্ড
- স্লাগ
- বাল্ক
- ওনার

Do not replace a familiar word merely to make the interface more purely Bengali.

## Statuses, sources, and return conditions

Keep system statuses and sources in their familiar English form when they are displayed as values, filters, or badges:

- PENDING
- CONFIRMED
- PROCESSING
- DELIVERED
- COMPLETED
- CANCELLED
- FAILED_DELIVERY
- WEBSITE
- PHYSICAL_SHOP
- FACEBOOK
- PHONE
- WHATSAPP
- OTHER
- SELLABLE
- DAMAGED
- CASH
- PAID
- COD

Natural sentences and action buttons may use familiar Bangla forms when they read better, such as “ডেলিভারড করুন” or “অর্ডারটি বাতিল হবে”. Do not change the underlying enum or API value.

## Quantity and inventory wording

- Keep the word “ইউনিট” whenever a number represents product or stock quantity.
- Prefer “ধনাত্মক পরিমাণ” over “০-এর বেশি পরিমাণ”.
- Prefer “ধনাত্মক ক্রয়মূল্য” over “০-এর বেশি ক্রয়মূল্য”.
- “সমন্বয়” is acceptable. Use “স্টক সমন্বয়”, “সমন্বয়ের কারণ”, and “সমন্বয় সংরক্ষণ” where they accurately describe the operation.
- Keep “সংরক্ষিত ইউনিট” as written. Do not replace it with “অর্ডারের জন্য রাখা ইউনিট”.
- Replace “উপলভ্য” in customer or owner-facing stock descriptions with a direct explanation:
  - উপলভ্য ইউনিট → বিক্রির জন্য থাকা ইউনিট
  - উপলভ্য স্টক শূন্য → বিক্রির জন্য স্টক নেই
  - উপলভ্য স্টক সতর্কতা সীমার মধ্যে → স্টক নির্ধারিত সীমায় নেমে এসেছে
- “ব্যাচ” is acceptable when the batch distinction matters. Prefer “স্টক ব্যাচ” when extra context is useful.

## FIFO wording

FIFO remains the required inventory business rule, but the acronym should not appear in normal interface copy.

Explain its result instead:

- FIFO অনুযায়ী স্টক সংরক্ষণ হবে → আগে কেনা স্টক আগে অর্ডারের জন্য রাখা হবে
- কমাবেন (FIFO) → স্টক কমান, আগের স্টক আগে
- FIFO খরচ → বিক্রি হওয়া পণ্যের ক্রয়মূল্য
- FIFO ইনভেন্টরি মূল্য → বর্তমান স্টকের ক্রয়মূল্য
- ক্রয় ও FIFO ইনভেন্টরি → ক্রয় ও স্টক

Never remove or change FIFO calculations, allocations, database fields, API behavior, or tests just because the acronym is hidden from the UI.

## Sales and analytics wording

- Prefer “সম্পন্ন” over “স্বীকৃত” when describing completed sales or orders.
- Prefer “বিক্রি” in natural descriptions. “বিক্রয়” may remain where it already reads naturally.
- Use “দোকানের বিক্রি” instead of “ফিজিক্যাল বিক্রয়”.
- Use “প্রতিদিনের বিক্রি ও লাভ” instead of “দৈনিক বিক্রয় ও মোট লাভ”.
- Use “মোট সম্পন্ন বিক্রি” instead of “মোট স্বীকৃত বিক্রয়”.
- Use “বিক্রি হওয়া পণ্যের ক্রয়মূল্য” instead of “FIFO খরচ”.
- Use “এই সময়ে কোনো সম্পন্ন বিক্রি নেই” instead of “এই সময়ে কোনো স্বীকৃত বিক্রয় নেই”.
- Use “আগের সময়ের তথ্য নেই” instead of “আগের সময়ের তুলনা নেই”.
- Use “ক্ষতি হবে” instead of “ঋণাত্মক” or “অলাভজনক” in user-facing warnings.

## Totals and money

Do not use “মোট” alone when the meaning could be unclear. Name what is being totalled:

- মোট দাম
- মোট টাকা
- মোট বিক্রি
- মোট লাভ
- মোট ইউনিট

Example:

- সার্ভার-নির্ধারিত মোট: ৳১,২৫০ → মোট দাম: ৳১,২৫০

## Developer terms to hide

Do not expose implementation language when a plain explanation is available:

- transaction
- CLI
- server-determined
- checkout internals
- placeholder
- overwrite
- allocation internals
- financial recognition
- audit log, unless the audit detail is necessary to the decision

Preferred examples:

- CLI দিয়ে তৈরি → সরাসরি তৈরি করা
- সার্ভার-নির্ধারিত মোট → মোট দাম
- প্লেসহোল্ডার দেখাবে → ডিফল্ট ছবি দেখাবে
- transaction-এ হবে → দামগুলো একসাথে পরিবর্তন হবে
- অডিট রেকর্ডে সংরক্ষিত হবে → সিদ্ধান্তটি রেকর্ডে রাখা হবে
- আর্থিক স্বীকৃতি হবে → বিক্রি ও লাভের হিসাবে যোগ হবে

## Preserve important behavior

Simple wording must still explain consequences accurately.

Good:

> দামগুলো একসাথে পরিবর্তন হবে। কোনো একটি পরিবর্তন ব্যর্থ হলে কোনো দামই বদলাবে না।

Avoid:

> কোনো একটি দাম পরিবর্তন না হলে, কোনো দামই পরিবর্তন হবে না।

The avoided version is shorter but does not clearly explain that the update is transactional.

For destructive or financial actions, state:

1. What will change.
2. What will happen to stock or money.
3. What will not be deleted or counted.
4. Whether a reason or confirmation is required.

## Approved examples

- ব্যাচই মূল স্টক রেকর্ড; সরাসরি স্টক ওভাররাইট করা হয় না → প্রতিটি ক্রয় আলাদা ব্যাচ হিসেবে রাখা হয়। আগে কেনা স্টক আগে কমবে।
- এই আর্থিক স্বীকৃতির কাজটি নিশ্চিত করার আগে অর্ডার সত্যিই পৌঁছেছে কি না যাচাই করুন → অর্ডারটি গ্রাহকের কাছে পৌঁছেছে কি না দেখে তারপর ডেলিভারড করুন।
- সংরক্ষিত স্টক ব্যবহৃত হবে এবং বিক্রয়, আয় ও মোট লাভ স্বীকৃত হবে → অর্ডারের জন্য রাখা স্টক বিক্রি হিসেবে কাটা হবে এবং বিক্রি ও লাভের হিসাবে যোগ হবে।
- কোনো স্টক পুনরুদ্ধার হবে না → পণ্যগুলো স্টকে যোগ হবে না।
- প্রভাবিত পণ্যের তালিকা লোড হয়নি → এই ক্যাটাগরির পণ্য লোড হয়নি।
- অতিথি বা অ্যাকাউন্ট দিয়ে অর্ডার করুন → লগইন ছাড়াও অর্ডার করতে পারবেন।
- আপনার অ্যাকাউন্টে প্রবেশ করুন → আপনার অ্যাকাউন্টে লগইন করুন।
- ফাঁকা রাখলে অনির্ধারিত থাকবে এবং checkout এই এলাকা গ্রহণ করবে না → ফাঁকা রাখলে এই এলাকায় অর্ডার নেওয়া যাবে না।

## Review checklist for AI

Before changing Bengali copy:

1. Check whether the current word is already familiar to a Bangladeshi user.
2. Remove developer terminology only from user-visible text.
3. Preserve units, money, stock, status, and business consequences.
4. Do not perform blanket replacements without checking context.
5. Keep “ইউনিট”, “ধনাত্মক”, and suitable uses of “সমন্বয়”.
6. Hide “FIFO” by explaining its behavior, but never change FIFO logic.
7. Replace “স্বীকৃত” with “সম্পন্ন” in sales and order copy.
8. Replace “উপলভ্য” with a direct stock explanation.
9. Qualify “মোট” with দাম, টাকা, বিক্রি, লাভ, or ইউনিট.
10. Keep status and source enum values unchanged.
11. Check that the new sentence is at least as precise as the old one.
12. Do not introduce an em dash.
