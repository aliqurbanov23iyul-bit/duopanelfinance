# Windows agent inteqrasiyası

PC Monitor hazırda **Agent not connected** göstərir. Gələcək agent Windows Performance Counters və uyğun olduqda istehsalçının GPU API-si vasitəsilə ölçüləri toplaya bilər. Dəstəklənməyən sensorlar üçün null göndərilməlidir.

1. Workspace sahibi cihazı qoşmaq üçün qısaömürlü, birdəfəlik pairing kodu yaradır. Qoşulma uğurlu olduqda server hər cihaz üçün ayrıca rotasiya edilə bilən credential qaytarır. Windows agenti credential-i Credential Manager və ya DPAPI ilə saxlayır.
2. Agent HTTPS üzərindən cihaz ID-si, batch ID, UTC ölçü vaxtı, CPU/RAM/GPU faizi, Celsius temperaturu, şəbəkə byte sayğacları və uptime saniyələrini göndərir. Müştəri workspace ID-sini avtorizasiya mənbəyi kimi istifadə etmir.
3. Server cihaz credential-ini yoxlayır, workspace-i cihaz qeydindən müəyyən edir, diapazonları və paket ölçüsünü təsdiqləyir və eyni batch ID-ni ikinci dəfə qəbul etmir. IP və cihaz üzrə rate limit, eksponensial retry və məhdud lokal növbə tətbiq edilir.
4. Gələcək pc_devices və pc_metrics cədvəllərinə RLS tətbiq edilir. Üzvlərə yalnız öz workspace telemetriyasını oxumaq icazəsi verilir. Agent yalnız ingest endpoint-i vasitəsilə yaza bilər.
5. Agent məsələn 30 saniyədən bir heartbeat göndərir. UI 90 saniyədən köhnə heartbeat-i oflayn sayır və son ölçünün vaxtını göstərir. Saxlama müddəti bitmiş nümunələr planlı işlə təmizlənir.

Bu sənəd gələcək protokolu təsvir edir. Endpoint, cihaz cədvəlləri və agent ayrıca həyata keçirilməlidir.