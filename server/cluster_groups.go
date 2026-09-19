package main

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"net/http"
)

type ClusterGroup struct {
	Metadata Metadata `json:"metadata"`
	Spec     struct {
		Selector *metav1.LabelSelector `json:"selector"`
	} `json:"spec"`
}

type ClusterGroupView struct {
	Name              string   `json:"name"`
	Namespace         string   `json:"namespace"`
	ClusterNamespaces []string `json:"clusterNamespaces"`
}

func clusterGroupView(group ClusterGroup, clusters []Cluster) (ClusterGroupView, error) {
	view := ClusterGroupView{Name: group.Metadata.Name, Namespace: group.Metadata.Namespace, ClusterNamespaces: []string{}}
	selector, err := metav1.LabelSelectorAsSelector(group.Spec.Selector)
	if err != nil {
		return view, err
	}
	for _, cluster := range clusters {
		if cluster.Metadata.Namespace == group.Metadata.Namespace && cluster.Status.Namespace != "" && selector.Matches(labels.Set(cluster.Metadata.Labels)) {
			view.ClusterNamespaces = append(view.ClusterNamespaces, cluster.Status.Namespace)
		}
	}
	return view, nil
}

func (a *App) handleClusterGroups(w http.ResponseWriter, r *http.Request) {
	groups, err := a.fleet.listClusterGroups(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	clusters, err := a.fleet.listClusters(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, err)
		return
	}
	items := make([]ClusterGroupView, 0, len(groups))
	for _, group := range groups {
		view, err := clusterGroupView(group, clusters)
		if err != nil {
			writeError(w, http.StatusBadGateway, err)
			return
		}
		items = append(items, view)
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
