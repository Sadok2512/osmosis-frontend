
DELETE FROM agent_modules;
DELETE FROM admin_documents;
DELETE FROM agent_runs;
DELETE FROM admin_agents;

INSERT INTO admin_agents (name, description, base_prompt, is_active) VALUES
  ('AI', 'Agent Intelligence Artificielle - Assistant IA généraliste', 'Tu es un assistant IA expert en télécommunications et analyse réseau.', true),
  ('QOE', 'Agent Quality of Experience - Analyse qualité réseau', 'Tu es un agent spécialisé dans l''analyse de la qualité d''expérience (QoE) des réseaux mobiles.', true),
  ('ORF', 'Agent Optimisation Radio Fréquence - Gestion radio', 'Tu es un agent expert en optimisation des paramètres radio et fréquences du réseau mobile.', true);
