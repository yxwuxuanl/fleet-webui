package main

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"testing"
)

func TestClusterGroupMembership(t *testing.T) {
	group := ClusterGroup{Metadata: Metadata{Name: "east", Namespace: "prod"}}
	group.Spec.Selector = &metav1.LabelSelector{MatchLabels: map[string]string{"env": "prod"}, MatchExpressions: []metav1.LabelSelectorRequirement{{Key: "region", Operator: metav1.LabelSelectorOpIn, Values: []string{"east"}}}}
	clusters := []Cluster{}
	for _, row := range []struct{ workspace, region, id string }{{"prod", "east", "cluster-a"}, {"prod", "west", "cluster-b"}, {"dev", "east", "cluster-c"}} {
		c := Cluster{Metadata: Metadata{Name: "edge", Namespace: row.workspace, Labels: map[string]string{"env": "prod", "region": row.region}}}
		c.Status.Namespace = row.id
		clusters = append(clusters, c)
	}
	view, err := clusterGroupView(group, clusters)
	if err != nil || len(view.ClusterNamespaces) != 1 || view.ClusterNamespaces[0] != "cluster-a" {
		t.Fatalf("unexpected membership: %+v, %v", view, err)
	}
	group.Spec.Selector = &metav1.LabelSelector{}
	view, err = clusterGroupView(group, clusters)
	if err != nil || len(view.ClusterNamespaces) != 2 {
		t.Fatalf("empty selector should match workspace clusters: %+v, %v", view, err)
	}
	group.Spec.Selector = &metav1.LabelSelector{MatchExpressions: []metav1.LabelSelectorRequirement{{Key: "region", Operator: "Invalid"}}}
	if _, err = clusterGroupView(group, clusters); err == nil {
		t.Fatal("invalid selectors must not silently match clusters")
	}
}
