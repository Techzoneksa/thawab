# قائمة الأمان — ثواب

## الأسرار والمفاتيح

- [x] جميع الأسرار في `.env` فقط
- [x] `.gitignore` يمنع رفع `.env`
- [x] `.env.example` يحتوي على أسماء المتغيرات فقط
- [ ] لا توجد أسرار في الكود (تم الفحص ولم نجد أي أسرار)

## الحماية المطلوبة لاحقاً

- [ ] HTTPS مفروض على جميع الاتصالات
- [ ] JWT مع Expiry قصير + Refresh Token
- [ ] RBAC على مستوى API
- [ ] Validation عبر Zod/class-validator
- [ ] Rate Limiting
- [ ] Audit Logs لكل عملية مالية
- [ ] Backups يومية
- [ ] حذف بيانات Mock قبل الإنتاج
- [ ] 2FA للأدوار الإدارية
- [ ] CORS مقيد
- [ ] Helmet/CSP Headers
- [ ] مراجعة أمنية خارجية قبل Go-Live
