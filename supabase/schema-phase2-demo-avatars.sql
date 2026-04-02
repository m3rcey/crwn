-- ============================================================
-- Add avatar_url to demo artist profiles
-- Uses DiceBear Avataaars style with dark skin tones
-- RUN IN: Supabase SQL Editor
-- SAFE TO RE-RUN: UPDATE is idempotent
-- ============================================================

UPDATE profiles SET avatar_url = CASE id
  WHEN 'aa000001-de00-4000-a000-000000000001'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=KiraVoss&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000002'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=DanteReyes&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000003'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=SoleilPark&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000004'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=JunoBlake&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000005'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=RioNakamura&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000006'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=AriaFontaine&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000007'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=ZekeHolloway&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000008'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=NovaSterling&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000009'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=MiloCross&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000010'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=SageDeluca&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000011'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=LyricOkafor&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000012'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=PhoenixBae&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000013'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=IndigoWells&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000014'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=RavenCruz&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000015'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=AtlasYoung&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000016'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=EmberSato&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000017'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=QuinnMercer&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000018'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=OnyxRivera&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000019'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=CleoAshford&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000020'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=ReignTorres&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000021'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=BodhiKim&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000022'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=SableMontgomery&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000023'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=EchoVasquez&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000024'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=WrenCalloway&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000025'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=ZuriAdeyemi&skinColor=614335&backgroundColor=D4AF37&size=256'
END
WHERE id IN (
  'aa000001-de00-4000-a000-000000000001'::UUID,
  'aa000001-de00-4000-a000-000000000002'::UUID,
  'aa000001-de00-4000-a000-000000000003'::UUID,
  'aa000001-de00-4000-a000-000000000004'::UUID,
  'aa000001-de00-4000-a000-000000000005'::UUID,
  'aa000001-de00-4000-a000-000000000006'::UUID,
  'aa000001-de00-4000-a000-000000000007'::UUID,
  'aa000001-de00-4000-a000-000000000008'::UUID,
  'aa000001-de00-4000-a000-000000000009'::UUID,
  'aa000001-de00-4000-a000-000000000010'::UUID,
  'aa000001-de00-4000-a000-000000000011'::UUID,
  'aa000001-de00-4000-a000-000000000012'::UUID,
  'aa000001-de00-4000-a000-000000000013'::UUID,
  'aa000001-de00-4000-a000-000000000014'::UUID,
  'aa000001-de00-4000-a000-000000000015'::UUID,
  'aa000001-de00-4000-a000-000000000016'::UUID,
  'aa000001-de00-4000-a000-000000000017'::UUID,
  'aa000001-de00-4000-a000-000000000018'::UUID,
  'aa000001-de00-4000-a000-000000000019'::UUID,
  'aa000001-de00-4000-a000-000000000020'::UUID,
  'aa000001-de00-4000-a000-000000000021'::UUID,
  'aa000001-de00-4000-a000-000000000022'::UUID,
  'aa000001-de00-4000-a000-000000000023'::UUID,
  'aa000001-de00-4000-a000-000000000024'::UUID,
  'aa000001-de00-4000-a000-000000000025'::UUID
);

-- Also update the 4 recruiter profiles
UPDATE profiles SET avatar_url = CASE id
  WHEN 'cc000001-de00-4000-a000-000000000001'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=TanyaBridges&skinColor=ae5d29&backgroundColor=D4AF37&size=256'
  WHEN 'cc000001-de00-4000-a000-000000000002'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=DerekOsman&skinColor=614335&backgroundColor=D4AF37&size=256'
  WHEN 'cc000001-de00-4000-a000-000000000003'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=CamilleFrost&skinColor=d08b5b&backgroundColor=D4AF37&size=256'
  WHEN 'cc000001-de00-4000-a000-000000000004'::UUID THEN 'https://api.dicebear.com/9.x/avataaars/png?seed=JaylenScott&skinColor=614335&backgroundColor=D4AF37&size=256'
END
WHERE id IN (
  'cc000001-de00-4000-a000-000000000001'::UUID,
  'cc000001-de00-4000-a000-000000000002'::UUID,
  'cc000001-de00-4000-a000-000000000003'::UUID,
  'cc000001-de00-4000-a000-000000000004'::UUID
);
