# OCEA Smart Building

Relève les compteurs de votre logement depuis l'**espace résident OCEA
Smart Building** (<https://espace-resident.ocea-sb.com>) : eau froide, eau
chaude et chauffage, quand les compteurs de votre immeuble sont relevés à
distance par OCEA.

> **Sans lien avec OCEA Smart Building.** OCEA ne publie pas d'API publique :
> l'intégration lit le portail comme le fait votre navigateur, et peut cesser
> de fonctionner si OCEA le modifie.
>
> **Développée sans compte : retours bienvenus.** Dites-nous sur le forum
> Gladys ce que vous voyez, surtout si votre chauffage est mesuré par des
> répartiteurs.

## Ce que vous obtenez

Un appareil par logement de votre compte (plusieurs si vous en avez
plusieurs), avec une fonctionnalité par fluide affiché par le portail :

| Fonctionnalité                    | Unité      | Remarques                                   |
| --------------------------------- | ---------- | ------------------------------------------- |
| Eau froide                        | m³         | index cumulé                                |
| Eau chaude                        | m³         | index cumulé                                |
| Chauffage (énergie)               | kWh        | avec un compteur d'énergie thermique (CETC) |
| Chauffage (unités de répartiteur) | sans unité | avec des répartiteurs sur les radiateurs    |

**Compteur d'énergie ou répartiteurs ?** Un compteur d'énergie thermique
(CETC) mesure l'énergie reçue par le logement, en kWh. Les répartiteurs de
frais de chauffage, un par radiateur, ne mesurent pas d'énergie : ils
comptent des **unités** qui disent seulement quelle part de la facture de
chauffage de l'immeuble revient au logement. L'intégration présente donc les
unités de répartiteur comme un simple compteur sans unité, jamais en kWh.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**e-mail** et le **mot de passe** de votre espace résident
   OCEA. Vos logements sont trouvés depuis le compte.
3. Réglez si besoin l'**intervalle de relevé** (6 heures par défaut, de 1 à 24) et la **langue** des noms de compteurs.
4. Enregistrez, puis ouvrez l'onglet **Découverte** et ajoutez votre
   logement.

Le bouton **Tester la connexion et relever** se connecte tout de suite à
OCEA et indique le nombre de logements et de compteurs trouvés.

## Fréquence des relevés

Les compteurs OCEA envoient leur index une fois, ou quelques fois, par jour.
L'intégration lit le portail **toutes les 6 heures par défaut**, au plus
toutes les heures : lire plus souvent n'apporte pas de donnée plus fraîche et
ne fait que charger le portail. Le dernier relevé est conservé : redémarrer
Gladys ne relit pas OCEA avant la fin de l'intervalle. Une valeur qui ne change pas est tout de même renvoyée
à Gladys au moins toutes les 12 heures, pour que « Pas de valeur récente » ne
s'affiche jamais.

## Graphiques et suivi d'énergie

- **Eau** : l'index de chaque compteur est gardé dans l'historique de la
  fonctionnalité, et tracé par le graphique de l'appareil.
- **Chauffage en kWh (CETC)** : l'index est un index de compteur d'énergie,
  que le suivi d'énergie de Gladys transforme de lui-même en consommation par
  demi-heure et en coût. Gladys rattache un nouvel index d'énergie **sous votre
  compteur électrique principal** (s'il est défini) : dans **Intégrations → Suivi
  de l'énergie**, placez l'index du chauffage sur **Aucun parent (racine)**,
  sinon votre chauffage compte dans votre électricité. Comme l'index arrive
  toutes les quelques heures, la consommation de ces heures tombe dans une
  seule demi-heure.
- **Chauffage en unités de répartiteur** : un graphique d'historique du
  compteur seulement. Ces unités ne sont pas de l'énergie et n'entrent pas
  dans le suivi d'énergie.

## Widget de tableau de bord

Le widget **Consommation OCEA** affiche, pour le logement choisi, la
consommation du mois en cours par fluide. Elle est calculée par
l'intégration à partir des index relevés : le premier mois ne compte qu'à
partir du premier relevé, et le widget indique depuis quand il compte.

## Limites

- Seulement ce que montre le tableau de bord du portail : une valeur par
  fluide, pas de détail par radiateur ou par compteur, pas d'alerte.
- Les relevés ont le retard de ceux d'OCEA (souvent la veille).
- L'intégration a été développée sans compte : le cas des répartiteurs en
  particulier repose sur des hypothèses. Vos retours aident.

## Confidentialité

L'e-mail et le mot de passe restent dans la configuration de Gladys.
L'intégration garde le jeton de session OCEA et les derniers relevés dans son
volume `/data`, et n'écrit jamais d'identifiant ni de jeton dans ses logs.

## En cas de problème

- **« OCEA a refusé l'e-mail ou le mot de passe »** : vérifiez-les sur le
  portail, puis enregistrez-les à nouveau. L'intégration cesse d'essayer en
  attendant, pour ne jamais bloquer votre compte.
- **« Le portail OCEA n'a pas répondu »** : OCEA peut être en maintenance.
  L'intégration réessaie dans 30 minutes.
- Ouvrez l'onglet **Journaux** de l'intégration pour voir ce qui s'est passé.
  Un relevé normal n'y écrit rien : seuls apparaissent le démarrage, la
  connexion à OCEA, les erreurs (une ligne quand elles surviennent, une quand
  tout refonctionne) et vos actions.
