INSERT INTO knowledge_nodes (id, node_type, title, content, tags) VALUES
('C-010', 'CONSTRAINT', 'Liability cap policy', 'Firm policy: liability in any contract must be capped at maximum 2x the annual contract value. Uncapped liability = automatic HIGH risk flag.', JSON_ARRAY('contract','liability')),
('C-011', 'CONSTRAINT', 'Non-solicitation / non-compete duration', 'Firm policy: non-compete and non-solicitation clauses must not exceed 12 months. Any duration > 12 months must be rejected or negotiated down.', JSON_ARRAY('contract','non_compete')),
('C-012', 'CONSTRAINT', 'IP assignment carve-out', 'Firm policy: IP assignment clauses must include carve-out for pre-existing IP. Broad all-IP assignments without carve-out = HIGH risk.', JSON_ARRAY('contract','ip')),
('C-013', 'CONSTRAINT', 'Arbitration preferred', 'Firm policy: arbitration (SIAC or LCIA rules) preferred over litigation for cross-border contracts. Removal of arbitration clause = flag for review.', JSON_ARRAY('contract','dispute')),
('C-014', 'CONSTRAINT', 'Termination notice threshold', 'Firm policy: termination for convenience must have minimum 90 days notice. Shorter notice periods disadvantage our clients.', JSON_ARRAY('contract','termination')),
('AP-010', 'ANTI_PATTERN', 'One-sided indemnity', 'Do not accept one-sided indemnification in vendor contracts. Always insist on mutual indemnification.', JSON_ARRAY('contract','indemnity')),
('AP-011', 'ANTI_PATTERN', 'Auto-renewal opt-out window', 'Flag any auto-renewal opt-out window under 90 days.', JSON_ARRAY('contract','auto_renewal')),
('D-010', 'DECISION', 'Return of materials', 'Every NDA must include a clause requiring return or destruction of confidential materials on termination.', JSON_ARRAY('nda','materials')),
('D-011', 'DECISION', 'Penalty vs liquidated damages', 'Disproportionate liquidated damages may be struck down as a penalty if they exceed reasonable loss estimates.', JSON_ARRAY('contract','penalty')),
('D-012', 'DECISION', 'Jurisdiction clarity', 'Clear dispute resolution clauses save time and legal expense in cross-border matters.', JSON_ARRAY('contract','jurisdiction'));
