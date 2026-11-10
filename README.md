# DUO SPACE

İki nəfərlik, dəvətli şəxsi workspace. Brauzer interfeysi HTML, CSS və Vanilla JavaScript ES Modules ilə yazılıb. esbuild-wasm yalnız build alətidir. Məlumat Supabase Auth, PostgreSQL, Realtime və private Storage vasitəsilə idarə olunur.

## Lokal quraşdırma

1. Node.js 22 və ya daha yeni versiya ilə `npm install` işlədin.
2. `.env.example` faylını `.env.local` adına kopyalayın.
3. `VITE_SUPABASE_URL` dəyişəninə Supabase layihəsinin HTTPS ünvanını, `VITE_SUPABASE_PUBLISHABLE_KEY` dəyişəninə publishable və ya legacy anon açarını yazın. Bu iki parametr brauzerə göndərilir. Service-role və secret açarları bu dəyişənlərə yazılmamalıdır.
4. `npm run dev` və `http://127.0.0.1:4173`. Build zamanı dəyişənlər oxunur. Dəyişdirdikdə yenidən build edin.

## Supabase quraşdırması

1. SQL Editor-da üç migration faylını ad sırası ilə tətbiq edin. Authentication ayarlarında açıq qeydiyyatı bağlayın.
2. Layihənin HTTPS ünvanını, publishable açarını və service-role açarını lokal .env.local faylına yazın. Service-role açarını yalnız serverdə və admin yaratmaq üçün istifadə edin.
3. PowerShell-də admini bir dəfə yaradın. Şifrə sorğusunda admin şifrəsini daxil edin.

```powershell
$env:DUO_BOOTSTRAP_PASSWORD = Read-Host 'Admin şifrəsi' -MaskInput
try { node --env-file=.env.local scripts/create-admin.mjs ok4nner }
finally { Remove-Item Env:DUO_BOOTSTRAP_PASSWORD }
```

4. DUO_ACCESS_CODE üçün ayrıca, təsadüfi uzun giriş kodu seçin. Bu kod tətbiqin giriş formasında hər yeni sessiya üçün yoxlanır. “Yadda saxla” seçilsə, brauzer sessiya tokenini növbəti açılış üçün saxlayır.
5. Admin hesabı ilə daxil olun və workspace yaradın. Ayarlar → Admin panelində ikinci üzvün istifadəçi adını və şifrəsini yaradın. Üzv avtomatik workspace-ə qoşulur.
6. Giriş və admin əməliyyatları Vercel Functions istifadə edir. Statik npm run dev önizləməsi API endpoint-lərini işlətmir. Funksiyalarla lokal test üçün Vercel CLI-də vercel dev istifadə edin.
Pul qəpiklə, tam ədəd kimi saxlanır. Tək qəpik qalıq olduqda onu ödəyən üzv daşıyır. Ödənişi pulu qaytaran üzv qeyd edir. Profilin onlayn statusu görünən brauzer tabından periodik heartbeat əsasında təxmin olunur.

Drive obyektləri private bucket-dədir. Metadata yazısı uğursuz olduqda tətbiq yüklənmiş obyekti silməyə çalışır. İki xidmət əməliyyatı arasında bağlantı itərsə, operator Storage-də yetim obyektləri ayrıca yoxlamalıdır.

## Vercel

1. Mənbə fayllarını GitHub repo-ya göndərin və repo-nu Vercel-də import edin. Layihə preset-i **Other** seçin.
2. Vercel Environment Variables bölməsində VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY və DUO_ACCESS_CODE dəyişənlərini uyğun mühitlərə əlavə edin. Son iki dəyişəni Sensitive kimi saxlayın. Preview üçün ayrıca Supabase layihəsi istifadə oluna bilər.
3. Deploy edin. `vercel.json` build əmri, `dist` çıxışı və təhlükəsizlik başlıqlarını təyin edir. Standart `*.supabase.co` ünvanından fərqli custom domen istifadə edirsinizsə CSP-də uyğun HTTPS və WSS origin-lərini əlavə edin.
4. Auth URL Configuration bölməsində istifadə etdiyiniz domeni qeyd edin. Dəvət sınağında ikinci hesabı başqa brauzer profili ilə açın.

## Sınaqlar

`npm test` pul, bölüşdürmə, CSV və URL məntiqini yoxlayır. `npm run build` istehsal paketini hazırlayır.

İki fərqli brauzer profilində aşağıdakı inteqrasiya sınaqlarını icra edin.

- Admin workspace yaradır və ikinci üzvü paneldən əlavə edir. Yanlış kodla giriş və adi üzvün admin API çağırışı rədd edilməlidir.
- A mesaj göndərir. B mesajı səhifəni yeniləmədən görür və yeniləmədən sonra mesaj saxlanılır.
- A şəxsi xərc, qeyd, hadisə və fayl yaradır. B onları interfeysdə və autentifikasiyalı API sorğularında görməməlidir.
- A 30 AZN, B 10 AZN ortaq xərc yaradır. B-nin A-ya borcu 10 AZN olur. B 10 AZN qaytardıqda balans sıfırlanır.
- A və ya təyin edilmiş B tapşırığı tamamlayır. Status dövrü eyni tapşırıq üçün ikinci dəfə XP yaratmamalıdır.
- Səlahiyyətsiz sessiya Storage faylını oxuya bilməməlidir. Ortaq faylın signed link-i 60 saniyə qüvvədədir.

## Cari əhatə

Əsas dashboard, workspace dəvəti, Wallet, mətn Chat, düz Drive, Kanban, Projects, Markdown Notes, Calendar, XP lider cədvəli, Vibes və in-app bildiriş axınları mövcuddur. PC Monitor və AI ayrıca gələcək modullar kimi göstərilir.

Açıq işlərə profil avatarı, chat reaksiyaları və oxunma statusu, cavablar və səs/fayl əlavələri, Drive qovluq naviqasiyası və resumable upload, tapşırıq şərhləri və tarixçəsi, qeyd autosave, xatırlatmalar, brauzer bildirişləri, Arena challenge və streak-lər, tam SQL inteqrasiya sınaqları və canlı deployment daxildir.

[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) · [Supabase Realtime](https://supabase.com/docs/guides/realtime/postgres-changes) · [Vercel konfiqurasiyası](https://vercel.com/docs/project-configuration/vercel-json)