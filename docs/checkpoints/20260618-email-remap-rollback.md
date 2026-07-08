# Email remap prod 2026-06-18 — rollback record

Đổi User.username + User.email + Employee.email. Để revert: đổi NEW→OLD theo uid.
39 applied, 3 skipped (dung.pn already, trung.nv conflict uid74_OLD, ngoc.ttn not-found).
KC chỉ có salessupport1/2 lúc đổi → 37 mailbox còn lại cần Microsoft tạo + login bằng mailbox mới.

uid | OLD | NEW
212 | nhu.ltp@ | assistant@
252 | thanh.tn@ | marketing.design1@
244 | nam.dx@ | marketing.design2@
232 | binh.ltn@ | marketing1@
38  | trang.ttt@ | marketing2@
37  | nghia.vt@ | marketing3@
349 | nga.tt@ | salesdirector@
293 | tri.lv@ | salesmanager@
32  | thu.vt@ | ota.sales1@
119 | long.nh@ | ca.sales@
329 | dieu.nk@ | ca.sales1@
97  | tuan.tm@ | ca.sales2@
249 | thu.tta@ | ca.sales3@
237 | trung.ld@ | sales.ca4@
33  | thien.vv@ | ca.sales5@
326 | quynh.tnh@ | sa.sales@
220 | trinh.htn@ | sa.sales1@
96  | my.ltn@ | sa.sales2@
235 | lam.bh@ | sa.sales3@
34  | ngan.ttk@ | sa.sales4@
141 | an.dct@ | ctv@
2   | thanh.tn1@ | hrm@
101 | an.nd1@ | training.lead@
76  | thi.dtd@ | recruitment@
271 | yen.tth@ | admin.lead@
238 | hang.dtt@ | admin1@
279 | nhung.ntk@ | admin2@
306 | vu.pc@ | admin3@
319 | loc.tnk@ | admin4@
288 | nhi.dty@ | admin5@
218 | trinh.ntm01@ | mice.lead@
316 | khanh.dt@ | mice.sales1@
213 | quan.nh@ | mice.sales2@
26  | cong.tt@ | mice.sales3@
94  | hieu.ht@ | mice.events@
228 | so.nv@ | inbound.tl@
242 | huyen.nt@ | fit.sales1@
133 | nhien.hnn@ | fit.sales2@
102 | huy.hnd@ | tour.ops1@
(all @hongngocha.com)
131 | ngoc.tnt@ | fit.lead@   (HNH00224 NGỌC TRƯƠNG THỊ NHƯ; list ghi nhầm ngoc.ttn@)
# trung.nv@/HNH00280_OLD (uid74): ĐÃ XOÁ CỨNG — không rollback được
