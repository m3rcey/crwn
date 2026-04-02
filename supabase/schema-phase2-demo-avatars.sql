-- ============================================================
-- Add avatar_url to demo artist profiles
-- Uses DiceBear Notionists style for artistic-looking avatars
-- RUN IN: Supabase SQL Editor
-- SAFE TO RE-RUN: Uses ON CONFLICT / WHERE clause
-- ============================================================

UPDATE profiles SET avatar_url = CASE id
  WHEN 'aa000001-de00-4000-a000-000000000001'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=KiraVoss&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000002'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=DanteReyes&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000003'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=SoleilPark&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000004'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=JunoBlake&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000005'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=RioNakamura&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000006'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=AriaFontaine&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000007'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=ZekeHolloway&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000008'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=NovaSterling&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000009'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=MiloCross&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000010'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=SageDeluca&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000011'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=LyricOkafor&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000012'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=PhoenixBae&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000013'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=IndigoWells&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000014'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=RavenCruz&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000015'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=AtlasYoung&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000016'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=EmberSato&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000017'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=QuinnMercer&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000018'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=OnyxRivera&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000019'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=CleoAshford&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000020'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=ReignTorres&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000021'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=BodhiKim&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000022'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=SableMontgomery&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000023'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=EchoVasquez&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000024'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=WrenCalloway&backgroundColor=D4AF37&size=256'
  WHEN 'aa000001-de00-4000-a000-000000000025'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=ZuriAdeyemi&backgroundColor=D4AF37&size=256'
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
  WHEN 'cc000001-de00-4000-a000-000000000001'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=TanyaBridges&backgroundColor=D4AF37&size=256'
  WHEN 'cc000001-de00-4000-a000-000000000002'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=DerekOsman&backgroundColor=D4AF37&size=256'
  WHEN 'cc000001-de00-4000-a000-000000000003'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=CamilleFrost&backgroundColor=D4AF37&size=256'
  WHEN 'cc000001-de00-4000-a000-000000000004'::UUID THEN 'https://api.dicebear.com/9.x/notionists/png?seed=JaylenScott&backgroundColor=D4AF37&size=256'
END
WHERE id IN (
  'cc000001-de00-4000-a000-000000000001'::UUID,
  'cc000001-de00-4000-a000-000000000002'::UUID,
  'cc000001-de00-4000-a000-000000000003'::UUID,
  'cc000001-de00-4000-a000-000000000004'::UUID
);
